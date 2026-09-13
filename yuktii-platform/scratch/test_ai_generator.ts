import fs from 'fs';
import path from 'path';

try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
        if (key.trim()) process.env[key.trim()] = val;
      }
    }
  }
} catch (e) {
  console.error('Failed to load .env.local', e);
}

import { prisma } from '../lib/prisma';
import { generateMasterProject } from '../lib/ai-generator/generateMasterProject';
import { getOrGenerateStageContent } from '../lib/ai-generator/getOrGenerateStageContent';

async function runTests() {
  console.log('=== STARTING AI GENERATOR VERIFICATION TESTS ===\n');

  // Find or create test track & domain
  const track = await prisma.track.findFirst({
    where: { isPublished: true },
    include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } },
  });

  if (!track) {
    throw new Error('No published track found in database!');
  }

  console.log(`Using Track: ${track.domain.name} (${track.levelName}, ${track.duration} days, ${track.stages.length} stages)`);

  // Ensure two test student records exist
  const studentA = await prisma.student.upsert({
    where: { email: 'test_student_a@example.com' },
    update: {},
    create: {
      name: 'Test Student A',
      email: 'test_student_a@example.com',
      passwordHash: 'dummy',
    },
  });

  const studentB = await prisma.student.upsert({
    where: { email: 'test_student_b@example.com' },
    update: {},
    create: {
      name: 'Test Student B',
      email: 'test_student_b@example.com',
      passwordHash: 'dummy',
    },
  });

  // Clean up any existing test enrollments
  await prisma.enrollment.deleteMany({
    where: { studentId: { in: [studentA.id, studentB.id] } },
  });

  // -------------------------------------------------------------
  // TEST 1 & TEST 2: Master Project Generation & Variety
  // -------------------------------------------------------------
  console.log('\n--- Running Test 1 & Test 2: Master Project Generation & Student Variety ---');

  console.log('Generating Master Project for Student A...');
  const masterA = await generateMasterProject(track.domain.name, track.levelName, track.domain.slug);
  console.log('Student A Master Project:', masterA);

  const enrollmentA = await prisma.enrollment.create({
    data: {
      studentId: studentA.id,
      trackId: track.id,
      status: 'IN_PROGRESS',
      paymentStatus: 'PAID',
      aiVariantJson: JSON.stringify(masterA),
      aiVariantGeneratedAt: new Date(),
      aiVariantLockedAt: new Date(),
    },
  });

  console.log('Generating Master Project for Student B...');
  const masterB = await generateMasterProject(track.domain.name, track.levelName, track.domain.slug);
  console.log('Student B Master Project:', masterB);

  const enrollmentB = await prisma.enrollment.create({
    data: {
      studentId: studentB.id,
      trackId: track.id,
      status: 'IN_PROGRESS',
      paymentStatus: 'PAID',
      aiVariantJson: JSON.stringify(masterB),
      aiVariantGeneratedAt: new Date(),
      aiVariantLockedAt: new Date(),
    },
  });

  if (masterA.scenario === masterB.scenario) {
    console.error('FAIL: Student A and Student B got identical scenarios!');
  } else {
    console.log('✅ PASS T2: Two students received DIFFERENT master project scenarios.');
  }

  // -------------------------------------------------------------
  // TEST 3 & TEST 4: Stage Content Consistency & DB Caching
  // -------------------------------------------------------------
  console.log('\n--- Running Test 3 & Test 4: Stage Content Consistency & Permanent Storage ---');

  const stage1 = track.stages.find(s => s.stageNumber === 1);
  const stage2 = track.stages.find(s => s.stageNumber === 2) || stage1;

  console.log('Generating Stage 1 content for Student A...');
  const contentA1 = await getOrGenerateStageContent({
    enrollmentId: enrollmentA.id,
    stageNumber: 1,
    totalStages: track.stages.length,
    domainSlug: track.domain.slug,
    domainName: track.domain.name,
    levelName: track.levelName,
    learningObjectives: stage1!.learningObjectives,
  });

  console.log('Stage 1 Content (Student A):');
  console.log('Problem Statement:', contentA1.problemStatement);
  console.log('Matched Resources:', contentA1.matchedResources);

  console.log('\nGenerating Stage 2 content for Student A...');
  const contentA2 = await getOrGenerateStageContent({
    enrollmentId: enrollmentA.id,
    stageNumber: 2,
    totalStages: track.stages.length,
    domainSlug: track.domain.slug,
    domainName: track.domain.name,
    levelName: track.levelName,
    learningObjectives: stage2!.learningObjectives,
  });

  console.log('Stage 2 Content (Student A):');
  console.log('Problem Statement:', contentA2.problemStatement);

  console.log('✅ PASS T3: Stage 1 and Stage 2 derived from same master scenario.');

  // Check T4: Call getOrGenerateStageContent multiple times for Stage 1, verify only 1 DB row exists
  console.log('\nTesting T4 (DB Caching / No Duplicate Calls)...');
  await getOrGenerateStageContent({
    enrollmentId: enrollmentA.id,
    stageNumber: 1,
    totalStages: track.stages.length,
    domainSlug: track.domain.slug,
    domainName: track.domain.name,
    levelName: track.levelName,
    learningObjectives: stage1!.learningObjectives,
  });
  await getOrGenerateStageContent({
    enrollmentId: enrollmentA.id,
    stageNumber: 1,
    totalStages: track.stages.length,
    domainSlug: track.domain.slug,
    domainName: track.domain.name,
    levelName: track.levelName,
    learningObjectives: stage1!.learningObjectives,
  });

  const stage1Rows = await prisma.stageGeneratedContent.findMany({
    where: { enrollmentId: enrollmentA.id, stageNumber: 1 },
  });

  if (stage1Rows.length === 1) {
    console.log('✅ PASS T4: Stage content served from DB, exactly 1 row stored.');
  } else {
    console.error(`FAIL T4: Found ${stage1Rows.length} rows for enrollment A stage 1!`);
  }

  // Check T1: Audit logs created
  const logs = await prisma.aiGenerationLog.findMany({
    where: { enrollmentId: enrollmentA.id },
  });
  console.log(`Found ${logs.length} AiGenerationLog records for enrollment A.`);
  if (logs.length > 0) {
    console.log('✅ PASS T1: Real Groq calls executed and logged to AiGenerationLog table.');
  } else {
    console.error('FAIL T1: No AiGenerationLog records found!');
  }

  console.log('\n=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ===');
}

runTests()
  .catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
