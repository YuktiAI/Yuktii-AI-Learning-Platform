import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';

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

async function main() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = await groq.models.list();
  console.log('Available models:', models.data.map(m => m.id));
}

main().catch(console.error);
