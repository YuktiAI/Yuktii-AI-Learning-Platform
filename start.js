const { spawn } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('🚀 Starting Yuktii AI Labs Platform (All-In-One Runner)');
console.log('   - Frontend & API Backend : http://localhost:3000');
console.log('   - Evaluation Worker      : http://localhost:3001 (Health check)');
console.log('================================================================\n');

// In development, use 'dev' (Next.js hot-reload dev server + tsx watch worker)
// In production, use 'start'
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
const script = isProd ? 'start' : 'dev';

console.log(`[runner] Starting services in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode (script: npm run ${script})\n`);

const platform = spawn('npm', ['run', script], {
  cwd: path.join(__dirname, 'yuktii-platform'),
  shell: true,
  stdio: 'inherit'
});

const worker = spawn('npm', ['run', script], {
  cwd: path.join(__dirname, 'evaluation-worker'),
  shell: true,
  stdio: 'inherit'
});

platform.on('error', (err) => console.error('Platform error:', err));
worker.on('error', (err) => console.error('Worker error:', err));

function shutdown() {
  console.log('\n🛑 Stopping all services...');
  try { platform.kill(); } catch {}
  try { worker.kill(); } catch {}
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
