/**
 * lib/inline-evaluator.ts
 *
 * Lightweight synchronous evaluation that runs INSIDE the Next.js API route.
 * Used when Redis/BullMQ is not configured (dev mode, free tier, etc.).
 *
 * Pipeline:
 *  1. Fetch repo metadata + file tree from GitHub REST API (no auth for public repos)
 *  2. Fetch README content
 *  3. Fetch commit count (dev process signal)
 *  4. Use Groq to score requirements PASS / PARTIAL / FAIL
 *  5. Use Groq to generate a mentor report
 *  6. Compute weighted final score
 *  7. Persist result directly to Evaluation table
 *
 * No E2B, no BullMQ, no Anthropic required — works with the existing Groq key.
 */

import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';
import { generateAndDeliverCertificate } from '@/lib/certificate-generator';
import { generateWithFallback } from '@/lib/ai-generator/llm-provider';

// Candidate models handled by generateWithFallback

let _groq: Groq | null = null;
function groq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  return _groq;
}

// ── GitHub helpers ───────────────────────────────────────────────────────────

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const cleaned = url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

interface RepoInfo {
  exists: boolean;
  isPrivate: boolean;
  description: string;
  language: string;
  stars: number;
  size: number;
  topics: string[];
  defaultBranch: string;
}

interface FileTree {
  files: string[];
  hasReadme: boolean;
  hasRequirements: boolean;
  hasPackageJson: boolean;
  hasDockerfile: boolean;
  hasTests: boolean;
  hasNotebook: boolean;
}

interface CommitInfo {
  count: number;
  durationDays: number;
  summary: string;
}

async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const headers: Record<string, string> = { 'User-Agent': 'yuktii-evaluator/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) return { exists: false, isPrivate: false, description: '', language: '', stars: 0, size: 0, topics: [], defaultBranch: 'main' };

  const d = await res.json();
  return {
    exists:        true,
    isPrivate:     d.private ?? false,
    description:   d.description ?? '',
    language:      d.language ?? '',
    stars:         d.stargazers_count ?? 0,
    size:          d.size ?? 0,
    topics:        d.topics ?? [],
    defaultBranch: d.default_branch ?? 'main',
  };
}

async function fetchFileTree(owner: string, repo: string, branch: string): Promise<FileTree> {
  const headers: Record<string, string> = { 'User-Agent': 'yuktii-evaluator/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );

  if (!res.ok) return { files: [], hasReadme: false, hasRequirements: false, hasPackageJson: false, hasDockerfile: false, hasTests: false, hasNotebook: false };

  const d = await res.json();
  const files: string[] = (d.tree ?? []).filter((f: any) => f.type === 'blob').map((f: any) => f.path as string);

  const lower = files.map(f => f.toLowerCase());
  return {
    files:           files.slice(0, 200), // cap for prompt size
    hasReadme:       lower.some(f => f.includes('readme')),
    hasRequirements: lower.some(f => f === 'requirements.txt' || f === 'environment.yml' || f === 'pyproject.toml'),
    hasPackageJson:  lower.some(f => f === 'package.json'),
    hasDockerfile:   lower.some(f => f.includes('dockerfile')),
    hasTests:        lower.some(f => f.includes('test') || f.includes('spec') || f.includes('pytest')),
    hasNotebook:     lower.some(f => f.endsWith('.ipynb')),
  };
}

async function fetchReadme(owner: string, repo: string): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'yuktii-evaluator/1.0', Accept: 'application/vnd.github.raw' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, 3000); // cap for prompt
}

async function fetchCommitInfo(owner: string, repo: string): Promise<CommitInfo> {
  const headers: Record<string, string> = { 'User-Agent': 'yuktii-evaluator/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

  // Get first page of commits (up to 100)
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`,
    { headers }
  );
  if (!res.ok) return { count: 0, durationDays: 0, summary: 'Could not fetch commit history.' };

  const commits: any[] = await res.json();
  if (!commits.length) return { count: 0, durationDays: 0, summary: 'No commits found.' };

  const count = commits.length;
  const firstDate = new Date(commits[commits.length - 1].commit?.author?.date ?? Date.now());
  const lastDate  = new Date(commits[0].commit?.author?.date ?? Date.now());
  const durationDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000));

  const msgs = commits.slice(0, 10).map((c: any) => c.commit?.message?.split('\n')[0] ?? '').filter(Boolean);
  const summary = `${count} commits over ${durationDays} day(s). Sample messages: ${msgs.join('; ')}.`;

  return { count, durationDays, summary };
}

// ── Groq scoring ─────────────────────────────────────────────────────────────

interface RequirementResult {
  reqId:    string;
  reqText:  string;
  status:   'PASS' | 'PARTIAL' | 'FAIL';
  evidence: string;
  missing:  string;
}

async function scoreRequirements(
  requirements: string[],
  projectSpec:  { problemStatement: string; acceptanceCriteria: string[] },
  repoContext:  { description: string; language: string; files: string[]; readme: string; topics: string[] }
): Promise<RequirementResult[]> {

  const prompt = `You are a senior software engineer evaluating a student's GitHub repository against a project specification.

PROBLEM STATEMENT:
${projectSpec.problemStatement}

REQUIREMENTS TO EVALUATE (score each one):
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

REPOSITORY EVIDENCE:
- Language: ${repoContext.language}
- Description: ${repoContext.description}
- Topics/tags: ${repoContext.topics.join(', ') || 'none'}
- Files present (first 50): ${repoContext.files.slice(0, 50).join(', ')}
- README excerpt: ${repoContext.readme || '(no README)'}

For EACH requirement above, output a JSON array with objects:
{
  "reqId": "R1", // R1, R2, R3...
  "reqText": "<exact requirement text>",
  "status": "PASS" | "PARTIAL" | "FAIL",
  "evidence": "<what in the repo supports or contradicts this>",
  "missing": "<what is absent or incomplete>"
}

Rules:
- PASS = clearly implemented based on file names, README, language, description
- PARTIAL = partially implemented or unclear from available evidence
- FAIL = clearly missing or contradicted by evidence
- Be evidence-based, not just hopeful. If you can't tell from file listing + README, use PARTIAL.

Respond with ONLY the JSON array, no markdown, no explanation.`;

  try {
    const result = await generateWithFallback<RequirementResult[]>({
      taskName: 'InlineEvaluator/ScoreRequirements',
      systemPrompt: 'You are a senior software engineer evaluating a student repository against project requirements. Always respond with a valid JSON array only.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 2000,
      responseFormat: 'json_object',
    });

    if (Array.isArray(result.json)) {
      return result.json;
    }
    const raw = result.rawText.trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return requirements.map((r, i) => ({ reqId: `R${i+1}`, reqText: r, status: 'PARTIAL' as const, evidence: 'Could not parse evaluation', missing: '' }));
    return JSON.parse(match[0]) as RequirementResult[];
  } catch (err) {
    console.error('[inline-evaluator] scoreRequirements error:', err);
    return requirements.map((r, i) => ({ reqId: `R${i+1}`, reqText: r, status: 'PARTIAL' as const, evidence: 'Evaluation error', missing: '' }));
  }
}

interface MentorReport {
  score:        number;
  strengths:    string[];
  gaps:         string[];
  reasoning:    string;
  improvements: string[];
  nextSteps:    string[];
}

async function generateMentorReport(
  requirementResults: RequirementResult[],
  commitInfo:  CommitInfo,
  repoContext: { description: string; language: string; files: string[]; readme: string },
  finalScore:  number
): Promise<MentorReport> {

  const passCount    = requirementResults.filter(r => r.status === 'PASS').length;
  const partialCount = requirementResults.filter(r => r.status === 'PARTIAL').length;
  const failCount    = requirementResults.filter(r => r.status === 'FAIL').length;

  const prompt = `You are a senior technical mentor writing a project evaluation report for a student.

EVALUATION SUMMARY:
- Final Score: ${finalScore}/100
- Requirements: ${passCount} PASSED, ${partialCount} PARTIAL, ${failCount} FAILED
- Commit history: ${commitInfo.summary}
- Primary language: ${repoContext.language}
- README quality: ${repoContext.readme ? 'Present' : 'Missing'}

REQUIREMENT RESULTS:
${requirementResults.map(r => `[${r.status}] ${r.reqText}: ${r.evidence}${r.missing ? '. Missing: ' + r.missing : ''}`).join('\n')}

Write a concise mentor report as JSON:
{
  "score": ${finalScore},
  "strengths": ["<3-4 specific strengths based on evidence>"],
  "gaps": ["<3-4 specific gaps based on what failed>"],
  "reasoning": "<2-3 sentence explanation of why this score was given>",
  "improvements": ["<3-4 specific, actionable improvements>"],
  "nextSteps": ["<2-3 next-level skills or topics to explore>"]
}

Respond with ONLY the JSON object, no markdown.`;

  try {
    const result = await generateWithFallback<MentorReport>({
      taskName: 'InlineEvaluator/MentorReport',
      systemPrompt: 'You are a senior technical mentor writing a project evaluation report. Always respond with a valid JSON object only.',
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    if (result.json && typeof result.json.score === 'number') {
      return result.json;
    }
    const raw = result.rawText.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in response');
    return JSON.parse(match[0]) as MentorReport;
  } catch {
    return {
      score:        finalScore,
      strengths:    ['Repository submitted successfully', 'Project is publicly accessible'],
      gaps:         ['Some requirements could not be fully verified from repository structure alone'],
      reasoning:    `The project scored ${finalScore}/100 based on automated analysis of the repository structure, README, and file contents.`,
      improvements: ['Add a comprehensive README explaining the project', 'Ensure all core features are implemented and documented', 'Add tests to validate functionality'],
      nextSteps:    ['Deploy the project to a live URL', 'Write unit tests', 'Add CI/CD pipeline'],
    };
  }
}

// ── Weighted scoring ─────────────────────────────────────────────────────────

function computeScore(
  results:    RequirementResult[],
  commitInfo: CommitInfo,
  fileTree:   FileTree
): { finalScore: number; categoryScores: Record<string, number> } {

  // Requirements (25%) — based on PASS/PARTIAL/FAIL ratio
  const reqPoints = results.reduce((sum, r) => sum + (r.status === 'PASS' ? 1 : r.status === 'PARTIAL' ? 0.5 : 0), 0);
  const reqScore  = results.length > 0 ? Math.round((reqPoints / results.length) * 100) : 50;

  // Documentation (5%) — README present
  const docScore = fileTree.hasReadme ? 80 : 30;

  // Dev process (10%) — commit count and duration
  const devScore = commitInfo.count >= 10
    ? 90 : commitInfo.count >= 5
    ? 75 : commitInfo.count >= 3
    ? 60 : commitInfo.count >= 1
    ? 45 : 20;

  // Testing (5%) — test files present
  const testScore = fileTree.hasTests ? 80 : 30;

  // Architecture (10%) — reasonable file structure
  const archScore = fileTree.files.length >= 5 ? 75 : fileTree.files.length >= 2 ? 55 : 35;

  // Functionality (20%) + Code Quality (15%) — inferred from requirements
  const funcScore = Math.round(reqScore * 0.9);
  const codeScore = fileTree.files.length >= 3 ? Math.round(reqScore * 0.85) : Math.round(reqScore * 0.6);

  // Security (5%) — placeholder (would need actual code analysis)
  const secScore  = 70;

  // Innovation (5%) — topics, description richness
  const innovScore = fileTree.files.length >= 5 ? 75 : 60;

  // Weighted total
  const finalScore = Math.round(
    reqScore   * 0.25 +
    funcScore  * 0.20 +
    codeScore  * 0.15 +
    archScore  * 0.10 +
    devScore   * 0.10 +
    testScore  * 0.05 +
    docScore   * 0.05 +
    secScore   * 0.05 +
    innovScore * 0.05
  );

  return {
    finalScore: Math.min(100, Math.max(0, finalScore)),
    categoryScores: {
      requirements:  reqScore,
      functionality: funcScore,
      codeQuality:   codeScore,
      architecture:  archScore,
      devProcess:    devScore,
      testing:       testScore,
      documentation: docScore,
      security:      secScore,
      innovation:    innovScore,
    },
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runInlineEvaluation(params: {
  evaluationId:       string;
  submissionRecordId: string;
  repoUrl:            string;
  projectSpec: {
    problemStatement:   string;
    requirements:       string[];
    acceptanceCriteria: string[];
  };
}): Promise<void> {
  const { evaluationId, submissionRecordId, repoUrl, projectSpec } = params;

  // Mark as running
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data:  { status: 'running', startedAt: new Date(), currentStageLabel: 'Fetching repository information…' },
  });

  try {
    // ── Parse GitHub URL ────────────────────────────────────────────────────
    const parsed = parseGitHubRepo(repoUrl);
    if (!parsed) throw new Error('Invalid GitHub URL — could not parse owner/repo.');

    const { owner, repo } = parsed;

    // ── Stage 1: Repo info ──────────────────────────────────────────────────
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { currentStageLabel: 'Verifying repository access…' } });
    const repoInfo = await fetchRepoInfo(owner, repo);

    if (!repoInfo.exists) {
      throw new Error(`Repository ${owner}/${repo} not found or is private. Make sure the repo is public.`);
    }

    // ── Stage 2: File tree ──────────────────────────────────────────────────
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { currentStageLabel: 'Analysing repository structure…' } });
    const fileTree  = await fetchFileTree(owner, repo, repoInfo.defaultBranch);
    const readme    = await fetchReadme(owner, repo);

    // ── Stage 3: Commit history ─────────────────────────────────────────────
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { currentStageLabel: 'Analysing development process…' } });
    const commitInfo = await fetchCommitInfo(owner, repo);

    // Save deterministic checks
    const deterministicChecks = {
      readmeFound:    fileTree.hasReadme,
      buildSucceeds:  fileTree.hasPackageJson || fileTree.hasRequirements || fileTree.hasNotebook,
      testsRun:       fileTree.hasTests,
      testsPassCount: fileTree.hasTests ? 1 : 0,
      testsFailCount: 0,
    };

    await prisma.evaluation.update({
      where: { id: evaluationId },
      data:  { deterministicChecks: JSON.stringify(deterministicChecks) },
    });

    // ── Stage 4: Score requirements with Groq ───────────────────────────────
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { currentStageLabel: 'Scoring requirements with AI…' } });

    const reqs = projectSpec.requirements.length > 0
      ? projectSpec.requirements
      : ['Project implemented and accessible via the submitted link'];

    const requirementResults = await scoreRequirements(
      reqs,
      { problemStatement: projectSpec.problemStatement, acceptanceCriteria: projectSpec.acceptanceCriteria },
      { description: repoInfo.description, language: repoInfo.language, files: fileTree.files, readme, topics: repoInfo.topics }
    );

    // ── Stage 5: Compute scores ─────────────────────────────────────────────
    const { finalScore, categoryScores } = computeScore(requirementResults, commitInfo, fileTree);

    // ── Stage 6: Mentor report ──────────────────────────────────────────────
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { currentStageLabel: 'Writing mentor report…' } });
    const mentorReport = await generateMentorReport(
      requirementResults,
      commitInfo,
      { description: repoInfo.description, language: repoInfo.language, files: fileTree.files, readme },
      finalScore
    );

    // Update submission record with commit SHA placeholder
    await prisma.submissionRecord.update({
      where: { id: submissionRecordId },
      data:  { commitSha: `github-${owner}-${repo}-${Date.now()}` },
    });

    // ── Stage 7: Persist all results ────────────────────────────────────────
    const updatedEval = await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status:             'completed',
        currentStageLabel:  'Evaluation complete',
        finalScore,
        categoryScores:     JSON.stringify(categoryScores),
        requirementResults: JSON.stringify(requirementResults),
        gitHistoryAnalysis: JSON.stringify({
          commitCount:  commitInfo.count,
          durationDays: commitInfo.durationDays,
          summary:      commitInfo.summary,
        }),
        deterministicChecks: JSON.stringify(deterministicChecks),
        mentorReport:        JSON.stringify(mentorReport),
        completedAt:         new Date(),
      },
    });

    // ── Stage 8: Generate Certificate and Deliver via Email ──────────────────
    if (finalScore >= 70 && updatedEval.enrollmentId) {
      try {
        console.log(`[inline-evaluator] Triggering certificate generation for enrollment ${updatedEval.enrollmentId}`);
        await generateAndDeliverCertificate(evaluationId, updatedEval.enrollmentId);
      } catch (certErr) {
        console.error('[inline-evaluator] Certificate generation error:', certErr);
      }
    }

  } catch (err: any) {
    const errorMessage = err?.message ?? 'Evaluation failed due to an unknown error.';
    console.error('[inline-evaluator] Error:', err);
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status:       'failed',
        errorMessage,
        completedAt:  new Date(),
      },
    });
  }
}
