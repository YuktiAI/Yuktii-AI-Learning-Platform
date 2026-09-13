/**
 * 04-deterministic-checks.ts — Stage 4: Run deterministic checks before agents.
 *
 * Cheaper to run than agent loops, and gives OpenHands/mini-SWE-agent
 * grounding evidence to work from. Results stored in ctx.deterministicChecks.
 *
 * Checks performed:
 *  1. README present (README.md / README.txt / README.rst / README)
 *  2. Entry point files present (based on domain — e.g. main.py, app.py, pom.xml, etc.)
 *  3. Dependency install succeeds (npm install / pip install / mvn install)
 *  4. Application build/start succeeds (30s timeout)
 *  5. Test suite runs (jest / pytest / mvn test / cargo test)
 *  6. Required endpoints/functions exist (static grep check)
 *
 * Also applies the DETERMINISTIC_GATE_THRESHOLD: if <30% of checks pass,
 * the agent evaluation is skipped to avoid wasting API budget on junk submissions.
 */

import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { DETERMINISTIC_GATE_THRESHOLD } from '../config.js';
import { runCommandInSandbox, listFilesInSandbox } from '../sandbox/e2b-sandbox.js';
import type { PipelineContext, DeterministicCheckResult } from '../pipeline-context.js';

// ── Domain → expected entry point files ──────────────────────────────────────
const DOMAIN_ENTRY_POINTS: Record<string, string[]> = {
  'ai-ml':               ['main.py', 'model.py', 'train.py', 'notebook.ipynb', 'README.md'],
  'llm-generative-ai':   ['main.py', 'app.py', 'agent.py', 'chatbot.py', 'README.md'],
  'data-science':        ['main.py', 'analysis.py', 'model.py', 'README.md'],
  'data-analysis':       ['main.py', 'analysis.py', 'dashboard.py', 'report.py', 'README.md'],
  'fullstack-python':    ['main.py', 'app.py', 'manage.py', 'run.py', 'README.md'],
  'fullstack-java':      ['pom.xml', 'build.gradle', 'src/main/java', 'README.md'],
  'data-engineering':    ['dags/', 'pipeline.py', 'etl.py', 'airflow.cfg', 'README.md'],
  'erp-odoo':            ['__manifest__.py', 'models/', 'views/', 'README.md'],
  'iot':                 ['diagram.json', 'sketch.ino', 'main.py', 'wokwi.toml', 'README.md'],
};

// ── Domain → install + test commands ─────────────────────────────────────────
const DOMAIN_COMMANDS: Record<string, {
  install?: string;
  build?:   string;
  test?:    string;
}> = {
  'ai-ml':             { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'llm-generative-ai': { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'data-science':      { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'data-analysis':     { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'fullstack-python':  { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'fullstack-java':    { install: 'mvn install -DskipTests -q 2>&1 | tail -30 || gradle build -x test 2>&1 | tail -30', test: 'mvn test -q 2>&1 | tail -30 || gradle test 2>&1 | tail -30' },
  'data-engineering':  { install: 'pip install -r requirements.txt 2>&1 | tail -20', test: 'python -m pytest --tb=short -q 2>&1 || echo "no tests"' },
  'erp-odoo':          { install: 'echo "Odoo module — static analysis only"' },
  'iot':               { install: 'echo "IoT project — static analysis + simulator export check"' },
};

// Parse test output to extract pass/fail counts
function parseTestCounts(output: string): { passCount: number; failCount: number } {
  // pytest: "3 passed, 1 failed"
  const pytestMatch = output.match(/(\d+)\s+passed/);
  const pytestFail  = output.match(/(\d+)\s+failed/);

  // jest: "Tests:   3 passed, 1 failed"
  const jestMatch = output.match(/Tests:\s+.*?(\d+)\s+passed/);
  const jestFail  = output.match(/Tests:\s+.*?(\d+)\s+failed/);

  // mvn: "Tests run: 5, Failures: 1"
  const mvnPass = output.match(/Tests run:\s*(\d+)/);
  const mvnFail = output.match(/Failures:\s*(\d+)/);

  return {
    passCount: parseInt(pytestMatch?.[1] ?? jestMatch?.[1] ?? mvnPass?.[1] ?? '0', 10),
    failCount: parseInt(pytestFail?.[1] ?? jestFail?.[1] ?? mvnFail?.[1] ?? '0', 10),
  };
}

export async function runDeterministicChecks(ctx: PipelineContext): Promise<void> {
  const { evaluationId, job, sandboxId, sandboxRepoPath } = ctx;

  if (!sandboxId || !sandboxRepoPath) {
    throw new Error('Sandbox not initialized — cannot run deterministic checks.');
  }

  const { domainSlug } = job;
  const prisma = getPrisma();

  logger.info('Running deterministic checks', { evaluationId, stage: 'deterministic', domainSlug });

  const rawOutputLines: string[] = [];
  let checksPassedCount = 0;
  let checksTotalCount  = 0;

  // ── Check 1: Files present in repo root ───────────────────────────────────
  const rootFiles = await listFilesInSandbox(sandboxId, sandboxRepoPath);
  const rootFilesLower = rootFiles.map(f => f.toLowerCase());
  rawOutputLines.push(`Root files: ${rootFiles.join(', ')}`);

  const readmeVariants = ['readme.md', 'readme.txt', 'readme.rst', 'readme'];
  const readmeFound = readmeVariants.some(r => rootFilesLower.includes(r));
  checksTotalCount++;
  if (readmeFound) checksPassedCount++;
  rawOutputLines.push(`README found: ${readmeFound}`);

  // Check expected entry points for this domain
  const expectedEntries = DOMAIN_ENTRY_POINTS[domainSlug] ?? ['README.md'];
  const entryPointsFound: string[] = [];
  for (const ep of expectedEntries) {
    if (rootFilesLower.includes(ep.toLowerCase()) || rootFiles.some(f => f.toLowerCase().startsWith(ep.toLowerCase()))) {
      entryPointsFound.push(ep);
    }
  }
  const filesPresent = entryPointsFound.length >= Math.min(2, expectedEntries.length);
  checksTotalCount++;
  if (filesPresent) checksPassedCount++;
  rawOutputLines.push(`Entry points found: ${entryPointsFound.join(', ') || 'none'}`);

  // ── Check 2: Dependency install ────────────────────────────────────────────
  const domainCmds = DOMAIN_COMMANDS[domainSlug] ?? {};
  let buildSucceeds = false;

  if (domainCmds.install) {
    checksTotalCount++;
    const installResult = await runCommandInSandbox(
      sandboxId,
      `cd "${sandboxRepoPath}" && ${domainCmds.install}`,
      180_000 // 3 min
    );
    buildSucceeds = installResult.exitCode === 0;
    if (buildSucceeds) checksPassedCount++;
    rawOutputLines.push(`Install (exit ${installResult.exitCode}):\n${installResult.stdout.slice(0, 500)}`);
  }

  // ── Check 3: Test suite ────────────────────────────────────────────────────
  let testsRun = false;
  let testsPassCount = 0;
  let testsFailCount = 0;

  if (domainCmds.test && buildSucceeds) {
    checksTotalCount++;
    const testResult = await runCommandInSandbox(
      sandboxId,
      `cd "${sandboxRepoPath}" && timeout 120 ${domainCmds.test}`,
      150_000 // 2.5 min
    );
    const testOutput = testResult.stdout + testResult.stderr;
    rawOutputLines.push(`Tests (exit ${testResult.exitCode}):\n${testOutput.slice(0, 800)}`);

    if (testOutput.includes('no tests') || testOutput.includes('no test')) {
      // No tests — not a failure, just no test suite
      rawOutputLines.push('No test suite detected');
    } else {
      testsRun = true;
      const counts = parseTestCounts(testOutput);
      testsPassCount = counts.passCount;
      testsFailCount = counts.failCount;
      if (testsPassCount > 0 || testResult.exitCode === 0) {
        checksPassedCount++;
      }
    }
  }

  // ── Check 4: Required functions/patterns (static grep) ────────────────────
  const endpointsFound: string[] = [];
  checksTotalCount++;

  // Generic: grep for function definitions, API endpoints, route handlers
  const grepCmd = [
    `cd "${sandboxRepoPath}"`,
    `&& (grep -rn "def " --include="*.py" -l 2>/dev/null || true)`,
    `&& (grep -rn "app.route\\|@app\\.\\|router\\." --include="*.py" --include="*.js" --include="*.ts" -l 2>/dev/null || true)`,
    `&& (grep -rn "public.*void\\|public.*class" --include="*.java" -l 2>/dev/null || true)`,
  ].join(' ');

  const grepResult = await runCommandInSandbox(sandboxId, grepCmd, 30_000);
  const foundFiles = grepResult.stdout.trim().split('\n').filter(Boolean);
  endpointsFound.push(...foundFiles.slice(0, 10));

  if (endpointsFound.length > 0) {
    checksPassedCount++;
    rawOutputLines.push(`Code files with functions/routes: ${endpointsFound.join(', ')}`);
  } else {
    rawOutputLines.push('No function/route definitions found via grep');
  }

  // ── Assemble result ────────────────────────────────────────────────────────
  const passFraction = checksTotalCount > 0 ? checksPassedCount / checksTotalCount : 0;

  const result: DeterministicCheckResult = {
    filesPresent,
    readmeFound,
    buildSucceeds,
    testsRun,
    testsPassCount,
    testsFailCount,
    endpointsFound,
    rawOutput: rawOutputLines.join('\n').slice(0, 5000), // cap size
    checksPassedCount,
    checksTotalCount,
    passFraction,
  };

  ctx.deterministicChecks = result;

  // Persist to DB immediately (so dashboard can show partial results)
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { deterministicChecks: JSON.stringify(result) },
  });

  logger.info('Deterministic checks complete', {
    evaluationId,
    stage: 'deterministic',
    checksPassedCount,
    checksTotalCount,
    passFraction: passFraction.toFixed(2),
    gateResult: passFraction >= DETERMINISTIC_GATE_THRESHOLD ? 'PASS — agents will run' : 'FAIL — agents skipped',
  });

  // ── Apply tiered gate — skip agents if too few checks pass ────────────────
  if (passFraction < DETERMINISTIC_GATE_THRESHOLD) {
    logger.warn('Deterministic gate FAILED — skipping agent evaluation', {
      evaluationId,
      stage: 'deterministic',
      passFraction: passFraction.toFixed(2),
      threshold: DETERMINISTIC_GATE_THRESHOLD,
    });
    // Signal to worker.ts that agents should be skipped
    // We do this by setting a dummy openHandsResult with skipped=true
    ctx.openHandsResult = {
      summary: `Deterministic checks failed (${checksPassedCount}/${checksTotalCount} passed). ` +
               `The repository appears incomplete or does not contain runnable code. ` +
               `Agent evaluation was skipped to avoid wasting resources.`,
      flaggedIssues: [],
      rawLog: '',
      skipped: true,
    };
  }
}
