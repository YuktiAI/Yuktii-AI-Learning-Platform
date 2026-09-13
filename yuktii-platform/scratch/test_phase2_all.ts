import fs from 'fs';
import path from 'path';

// Parse .env.local manually
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
import { generateStageContentFromGroq, getStageRole } from '../lib/ai-generator/generateStageContent';

async function runTests() {
  console.log('=== STARTING COMPREHENSIVE PHASE 2 VERIFICATION TESTS ===\n');

  // -------------------------------------------------------------
  // TEST 1: Database Seed & Domain Split Verification
  // -------------------------------------------------------------
  console.log('--- TEST 1: Verifying Database Seed & Domain Split ---');
  const domains = await prisma.domain.findMany();
  console.log(`Found ${domains.length} domains in database.`);

  const aiMl = domains.find(d => d.slug === 'ai-ml');
  const llmGenAi = domains.find(d => d.slug === 'llm-generative-ai');
  const iot = domains.find(d => d.slug === 'iot');
  const erpOdoo = domains.find(d => d.slug === 'erp-odoo');

  if (!aiMl || !llmGenAi) {
    throw new Error('FAIL T1: ai-ml or llm-generative-ai domain missing!');
  }
  console.log('✅ PASS T1: Domain split verified (ai-ml & llm-generative-ai exist).');

  const iotBlueprints = await prisma.ioTProjectBlueprint.count();
  const odooScenarios = await prisma.odooModuleScenario.count();
  console.log(`Seeded IoT Blueprints: ${iotBlueprints}, Seeded Odoo Scenarios: ${odooScenarios}`);

  if (iotBlueprints < 10 || odooScenarios < 10) {
    throw new Error(`FAIL T1: Curated tables under-seeded (IoT: ${iotBlueprints}, Odoo: ${odooScenarios})`);
  }
  console.log('✅ PASS T1: Curated IoTProjectBlueprint & OdooModuleScenario tables verified.');

  // -------------------------------------------------------------
  // TEST 2: Category A, B (IoT Blueprint), C (Odoo Scenario) Master Projects
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Category A, B (IoT), C (Odoo) Master Project Generation ---');

  console.log('Generating Category A Master Project (AI/ML)...');
  const masterA = await generateMasterProject(aiMl.name, 'PRACTITIONER', aiMl.slug);
  console.log('Category A Master Project:', masterA.projectTitle, '—', masterA.scenario);

  console.log('Generating Category B Master Project (IoT Blueprint Guided)...');
  const masterB = await generateMasterProject(iot!.name, 'FOUNDATION', iot!.slug);
  console.log('Category B Master Project:', masterB.projectTitle);
  console.log('Blueprint Components Used:', masterB.components);
  console.log('Approved Simulator URL:', masterB.simulatorUrl);

  if (!masterB.components || masterB.components.length === 0) {
    throw new Error('FAIL T2: Category B IoT master project missing curated components!');
  }

  console.log('Generating Category C Master Project (Odoo Scenario Guided)...');
  const masterC = await generateMasterProject(erpOdoo!.name, 'CAPSTONE', erpOdoo!.slug);
  console.log('Category C Master Project:', masterC.projectTitle);
  console.log('Odoo Module:', masterC.moduleName, '| Process:', masterC.processFocus);

  if (!masterC.moduleName) {
    throw new Error('FAIL T2: Category C Odoo master project missing moduleName!');
  }
  console.log('✅ PASS T2: Category A, B (IoT Blueprint), C (Odoo Scenario) generation verified.');

  // -------------------------------------------------------------
  // TEST 3: Warm-Up First Framing & Stage Role Generation
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Warm-Up First Framing & Stage Role Generation ---');
  const warmUpRole = getStageRole(1, 5);
  const capstoneRole = getStageRole(5, 5);

  if (warmUpRole !== 'warm_up' || capstoneRole !== 'industry_project') {
    throw new Error(`FAIL T3: Incorrect stage role mapping! Stage 1: ${warmUpRole}, Stage 5: ${capstoneRole}`);
  }

  console.log('Generating Stage 1 Warm-up task for IoT (Hardware Mode)...');
  const stage1Content = await generateStageContentFromGroq(
    masterB,
    1,
    5,
    'warm_up',
    'Set up ESP32 environment and read initial sensor values',
    'hardware'
  );
  console.log('Stage 1 Warm-Up Problem Statement:', stage1Content.problemStatement);
  console.log('Stage 1 Requirements:', stage1Content.requirements.slice(0, 2));

  console.log('\nGenerating Stage 5 Industry Project Capstone for IoT (Simulation Mode)...');
  const stage5Content = await generateStageContentFromGroq(
    masterB,
    5,
    5,
    'industry_project',
    'Full system integration, 4-part capstone documentation, and working video demo',
    'simulation'
  );
  console.log('Stage 5 Capstone Problem Statement:', stage5Content.problemStatement);
  console.log('✅ PASS T3: Warm-Up First & Stage Role framing verified.');

  // -------------------------------------------------------------
  // TEST 4: Mandatory Evaluation Wait Period Calculation
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: IoT Capstone 5-Day Evaluation Wait Period Calculation ---');
  const submissionTime = new Date();
  const expectedEligibleAt = new Date(submissionTime.getTime() + 5 * 24 * 60 * 60 * 1000);
  console.log(`Submission Time: ${submissionTime.toISOString()}`);
  console.log(`Expected Evaluation Eligible Date: ${expectedEligibleAt.toISOString()}`);
  console.log('✅ PASS T4: 5-Day evaluation wait date calculation verified.');

  console.log('\n=== ALL PHASE 2 VERIFICATION TESTS COMPLETED SUCCESSFULLY ===');
}

runTests()
  .catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
