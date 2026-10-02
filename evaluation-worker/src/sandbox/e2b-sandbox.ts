/**
 * e2b-sandbox.ts — E2B managed sandbox wrapper.
 *
 * E2B (https://e2b.dev) provides ephemeral, isolated cloud sandboxes with:
 *  - Docker-capable runtimes (Python, Node, Java available)
 *  - Per-second billing
 *  - Built-in filesystem isolation and network restrictions
 *  - Official OpenHands integration support
 *
 * If E2B_API_KEY is not set, falls back to LOCAL execution mode for development.
 * WARNING: Local mode has NO isolation — never use in production.
 *
 * Sandbox lifecycle:
 *  1. createSandbox()   → returns sandboxId + connection details
 *  2. runCommand()      → executes a command inside the sandbox
 *  3. readFile()        → reads a file from the sandbox filesystem
 *  4. destroySandbox()  → terminates the sandbox (always called in finally block)
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { E2B_API_KEY } from '../config.js';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

export interface SandboxInfo {
  sandboxId: string;
  repoPath:  string;  // absolute path inside sandbox where repo is cloned
  isLocal:   boolean; // true in development fallback mode
  localTmpDir?: string; // set in local mode for cleanup
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ── E2B SDK dynamic import ────────────────────────────────────────────────────
// E2B SDK is optional — if not installed, fall back to local mode.
let e2bSdk: any = null;
async function getE2bSdk(): Promise<any> {
  if (e2bSdk) return e2bSdk;
  try {
    // @ts-ignore — optional package; falls back to local execution when not installed
    e2bSdk = await import('@e2b/code-interpreter');
    return e2bSdk;
  } catch {
    return null;
  }
}

// Active sandbox instances (sandboxId → sdk instance)
const activeSandboxes = new Map<string, any>();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a new sandbox and return connection info.
 * In E2B mode: spins up a managed cloud sandbox.
 * In local mode: creates a temp directory (DEV ONLY — no isolation).
 */
export async function createSandboxInstance(
  repoUrl:          string,
  evaluationId:     string,
  verifiedHeadSha?: string   // Workstream C: pin to this SHA immediately after clone
): Promise<SandboxInfo> {
  if (E2B_API_KEY) {
    return createE2bSandbox(repoUrl, evaluationId, verifiedHeadSha);
  }
  logger.warn(
    'E2B_API_KEY not set — using LOCAL fallback mode (NOT ISOLATED — dev only)',
    { evaluationId }
  );
  return createLocalSandbox(repoUrl, evaluationId, verifiedHeadSha);
}

/**
 * Run a shell command inside the sandbox.
 */
export async function runCommandInSandbox(
  sandboxId: string,
  command:   string,
  timeoutMs: number = 60_000
): Promise<CommandResult> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    // Local fallback — sandboxId is actually a tmp dir path
    return runCommandLocally(sandboxId, command, timeoutMs);
  }
  return runCommandInE2b(sandbox, command, timeoutMs);
}

/**
 * Read a file from the sandbox filesystem.
 */
export async function readFileFromSandbox(
  sandboxId: string,
  filePath:  string
): Promise<string> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    // Local fallback
    try {
      if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      const repoPath = path.join(sandboxId, 'repo', filePath);
      if (fs.existsSync(repoPath)) {
        return fs.readFileSync(repoPath, 'utf-8');
      }
      const directPath = path.join(sandboxId, filePath);
      if (fs.existsSync(directPath)) {
        return fs.readFileSync(directPath, 'utf-8');
      }
      return '';
    } catch {
      return '';
    }
  }
  try {
    // v1 API: sandbox.files.read(path) returns Uint8Array
    const bytes = await sandbox.files.read(filePath);
    return Buffer.from(bytes).toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * List files in a directory inside the sandbox.
 */
export async function listFilesInSandbox(
  sandboxId: string,
  dirPath:   string
): Promise<string[]> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    try {
      return fs.readdirSync(path.join(sandboxId, dirPath));
    } catch {
      return [];
    }
  }
  try {
    // v1 API: sandbox.files.list(path)
    const entries = await sandbox.files.list(dirPath);
    return entries.map((e: any) => e.name || e.path || String(e));
  } catch {
    return [];
  }
}

/**
 * Destroy the sandbox — always call this in the finally block.
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (sandbox) {
    try {
      await sandbox.kill();
    } catch (err) {
      logger.warn('E2B sandbox kill error', { sandboxId, error: String(err) });
    }
    activeSandboxes.delete(sandboxId);
    return;
  }

  // Local fallback cleanup
  if (sandboxId.startsWith(os.tmpdir())) {
    try {
      fs.rmSync(sandboxId, { recursive: true, force: true });
    } catch (err) {
      logger.warn('Local tmp dir cleanup error', { sandboxId, error: String(err) });
    }
  }
}

// ── E2B implementation ─────────────────────────────────────────────────────────

async function createE2bSandbox(repoUrl: string, evaluationId: string, verifiedHeadSha?: string): Promise<SandboxInfo> {
  const sdk = await getE2bSdk();
  if (!sdk || !sdk.Sandbox) {
    throw new Error('E2B SDK (@e2b/code-interpreter) not installed or incompatible. Run: npm install @e2b/code-interpreter');
  }

  logger.info('Creating E2B sandbox (v1 API)', { evaluationId });

  // v1 API: Sandbox.create({ apiKey, timeout (in seconds) })
  const sandbox = await sdk.Sandbox.create({
    apiKey:  E2B_API_KEY,
    timeout: 15 * 60, // seconds
  });

  const sandboxId = sandbox.sandboxId ?? sandbox.id ?? `e2b-${Date.now()}`;
  activeSandboxes.set(sandboxId, sandbox);

  // Workstream C: blobless partial clone + SHA pinning
  // --filter=blob:none fetches full commit graph without blob data (fast, history-preserving)
  // --no-single-branch ensures all branches are available for history analysis
  const repoPath = '/home/user/repo';
  const cloneResult = await runCommandInE2b(
    sandbox,
    `git clone --filter=blob:none --no-single-branch --no-recurse-submodules "${repoUrl}" "${repoPath}" 2>&1`,
    120_000 // 2 min for clone
  );

  if (cloneResult.exitCode !== 0) {
    await sandbox.kill().catch(() => {});
    activeSandboxes.delete(sandboxId);
    throw new Error(`Failed to clone repository: ${cloneResult.stdout}\n${cloneResult.stderr}`);
  }

  // Pin to verified HEAD SHA so force-pushes cannot alter the evaluated source
  if (verifiedHeadSha && verifiedHeadSha !== 'unknown') {
    const checkoutResult = await runCommandInE2b(
      sandbox,
      `git -C "${repoPath}" checkout "${verifiedHeadSha}" 2>&1`,
      30_000
    );
    if (checkoutResult.exitCode !== 0) {
      logger.warn('SHA pinning checkout failed — proceeding with default branch HEAD', {
        evaluationId, verifiedHeadSha, stderr: checkoutResult.stderr,
      });
    } else {
      logger.info('Repo pinned to verified HEAD SHA', { evaluationId, verifiedHeadSha });
    }
  }

  logger.info('E2B sandbox ready + repo cloned (blobless)', { evaluationId, sandboxId, repoPath });
  return { sandboxId, repoPath, isLocal: false };
}

async function runCommandInE2b(
  sandbox:   any,
  command:   string,
  timeoutMs: number
): Promise<CommandResult> {
  try {
    // v1 API: sandbox.commands.run(cmd, { timeout in seconds })
    const result = await sandbox.commands.run(command, { timeout: Math.ceil(timeoutMs / 1000) });
    return {
      stdout:   result.stdout ?? '',
      stderr:   result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  } catch (err) {
    return { stdout: '', stderr: String(err), exitCode: 1 };
  }
}

// ── Local fallback (DEV ONLY) ─────────────────────────────────────────────────

async function createLocalSandbox(repoUrl: string, evaluationId: string, verifiedHeadSha?: string): Promise<SandboxInfo> {
  const localTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuktii-eval-'));
  const repoPath    = path.join(localTmpDir, 'repo');

  logger.info('Cloning repo locally (blobless, dev mode)', { evaluationId, repoPath });

  try {
    // Workstream C: blobless partial clone (matches E2B mode)
    execSync(`git clone --filter=blob:none --no-single-branch --no-recurse-submodules "${repoUrl}" "${repoPath}" 2>&1`, {
      timeout: 120_000,
      stdio:   'pipe',
    });
  } catch (err: any) {
    fs.rmSync(localTmpDir, { recursive: true, force: true });
    throw new Error(`Failed to clone repository locally: ${err.message}`);
  }

  // Pin to verified HEAD SHA
  if (verifiedHeadSha && verifiedHeadSha !== 'unknown') {
    try {
      execSync(`git -C "${repoPath}" checkout "${verifiedHeadSha}" 2>&1`, {
        timeout: 15_000,
        stdio: 'pipe',
      });
      logger.info('Repo pinned to verified HEAD SHA (local)', { evaluationId, verifiedHeadSha });
    } catch (err: any) {
      logger.warn('SHA pinning checkout failed (local) — using default branch HEAD', {
        evaluationId, verifiedHeadSha, error: err.message,
      });
    }
  }

  // In local mode, sandboxId IS the tmp dir path (used for cleanup)
  activeSandboxes.set(localTmpDir, null); // sentinel — signals "local mode"
  return { sandboxId: localTmpDir, repoPath, isLocal: true, localTmpDir };
}

async function runCommandLocally(
  tmpDir:    string,
  command:   string,
  timeoutMs: number
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd:     path.join(tmpDir, 'repo'),
      timeout: timeoutMs,
      shell:   process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout:   err.stdout ?? '',
      stderr:   err.stderr ?? String(err),
      exitCode: err.code ?? 1,
    };
  }
}
