import { spawnSync } from 'node:child_process';

const projectRef = process.argv[2];
const productionUrl = process.argv[3];
if (!projectRef || !productionUrl) throw new Error('Usage: node scripts/configure-vercel-public-env.mjs <project-ref> <production-url>');

const keyResult = spawnSync('npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});
if (keyResult.status !== 0) throw new Error(`Could not retrieve Supabase public key: ${keyResult.stderr.trim()}`);

const output = keyResult.stdout.trim();
const jsonStart = Math.min(...['[', '{'].map((token) => { const index = output.indexOf(token); return index < 0 ? Number.POSITIVE_INFINITY : index; }));
const parsed = JSON.parse(output.slice(jsonStart));
const keys = Array.isArray(parsed) ? parsed : parsed.api_keys ?? parsed.keys ?? [];
const publicEntry = keys.find((entry) => entry.name === 'anon') ?? keys.find((entry) => entry.type === 'publishable') ?? keys.find((entry) => String(entry.name ?? '').includes('publishable'));
const publicKey = publicEntry?.api_key ?? publicEntry?.key ?? publicEntry?.value;
if (!publicKey) throw new Error(`No public Supabase key found. Available key names: ${keys.map((entry) => entry.name ?? entry.type).join(', ')}`);

const values = {
  VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: publicKey,
  VITE_API_PROXY_URL: `${productionUrl.replace(/\/$/, '')}/api/functions`
};

for (const target of ['production', 'preview', 'development']) {
  for (const [name, value] of Object.entries(values)) {
    spawnSync('npx', ['--yes', 'vercel', 'env', 'rm', name, target, '--yes'], { stdio: 'ignore' });
    const added = spawnSync('npx', ['--yes', 'vercel', 'env', 'add', name, target], { input: `${value}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (added.status !== 0) throw new Error(`Could not configure ${name} for ${target}: ${added.stderr.trim()}`);
  }
}

console.log(`Configured ${Object.keys(values).join(', ')} for production, preview, and development without persisting secret values.`);
