/**
 * 04b-score-on-execution.ts — Section 9.3 Execution-Based Scoring
 *
 * Runs real executable tests (including hidden test cases generated during structured generation)
 * directly against the student's code inside the isolated E2B / container sandbox.
 *
 * Rather than relying solely on LLM code inspection, concrete test execution commands
 * verify actual runtime behavior, pass/fail test status, and stdout results.
 */

import { getPrisma } from '../db.js';
import { runCommandInSandbox } from '../sandbox/e2b-sandbox.js';
import { logger } from '../logger.js';
import type { PipelineContext } from '../pipeline-context.js';

interface TestCaseSpec {
  name: string;
  command: string;
  expectedOutput?: string;
  points?: number;
}

interface TestExecutionResult {
  name: string;
  command: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  points: number;
  earnedPoints: number;
}

export async function scoreOnExecution(ctx: PipelineContext): Promise<void> {
  const { evaluationId, sandboxId, sandboxRepoPath, job } = ctx;
  const { enrollmentId, stageNumber } = job;

  if (!sandboxId || !sandboxRepoPath) {
    logger.warn('Skipping execution scoring — no sandbox available', { evaluationId });
    return;
  }

  logger.info('Starting execution-based scoring', { evaluationId, stage: 'scoreOnExecution', stageNumber });

  const prisma = getPrisma();
  let testCases: TestCaseSpec[] = [];

  try {
    const stageContent = await prisma.stageGeneratedContent.findUnique({
      where: {
        enrollmentId_stageNumber: {
          enrollmentId,
          stageNumber,
        },
      },
      select: { hiddenTestCases: true },
    });

    if (stageContent?.hiddenTestCases) {
      const parsed = JSON.parse(stageContent.hiddenTestCases);
      if (Array.isArray(parsed)) {
        testCases = parsed;
      }
    }
  } catch (err) {
    logger.warn('Could not read hidden test cases for execution scoring', {
      evaluationId,
      error: String(err),
    });
  }

  // If no specific hidden test cases were generated, check standard test commands
  if (testCases.length === 0) {
    logger.info('No custom hidden test cases found — running standard test suite discovery', { evaluationId });
    // Try npm test or pytest if standard test frameworks exist
    testCases = [
      {
        name: 'Automated test suite execution',
        command: 'npm test -- --passWithNoTests 2>&1 || pytest 2>&1 || python -m unittest 2>&1',
        points: 50,
      },
    ];
  }

  const results: TestExecutionResult[] = [];
  let totalPoints = 0;
  let earnedPoints = 0;
  let passedCount = 0;

  for (const tc of testCases) {
    const points = tc.points ?? 25;
    totalPoints += points;

    try {
      const execResult = await runCommandInSandbox(
        sandboxId,
        `cd "${sandboxRepoPath}" && ${tc.command}`,
        60_000 // 60s per test suite
      );

      let passed = execResult.exitCode === 0;
      if (passed && tc.expectedOutput && !execResult.stdout.includes(tc.expectedOutput)) {
        passed = false;
      }

      const pointsForTest = passed ? points : 0;
      if (passed) passedCount++;
      earnedPoints += pointsForTest;

      results.push({
        name: tc.name,
        command: tc.command,
        passed,
        exitCode: execResult.exitCode,
        stdout: execResult.stdout.slice(0, 1000),
        points,
        earnedPoints: pointsForTest,
      });

      logger.debug(`Test case executed: ${tc.name}`, {
        evaluationId,
        passed,
        exitCode: execResult.exitCode,
      });
    } catch (testErr) {
      results.push({
        name: tc.name,
        command: tc.command,
        passed: false,
        exitCode: -1,
        stdout: `Execution timed out or threw error: ${String(testErr)}`,
        points,
        earnedPoints: 0,
      });
    }
  }

  ctx.executionScore = {
    passedCount,
    totalCount: testCases.length,
    details: results,
  };

  // Enhance deterministicChecks with live test execution results
  if (ctx.deterministicChecks) {
    ctx.deterministicChecks.testsRun = results.length > 0;
    ctx.deterministicChecks.testsPassCount = passedCount;
    ctx.deterministicChecks.testsFailCount = testCases.length - passedCount;
  }

  logger.info('Execution-based scoring completed', {
    evaluationId,
    stage: 'scoreOnExecution',
    passedCount,
    totalCount: testCases.length,
    earnedPoints,
    totalPoints,
  });
}
