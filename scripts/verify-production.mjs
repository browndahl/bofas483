import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const projectRef = process.argv[2];
const productionUrl = process.argv[3]?.replace(/\/$/, '');
if (!projectRef || !productionUrl) throw new Error('Usage: node scripts/verify-production.mjs <project-ref> <production-url>');

const keyResult = spawnSync('npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});
if (keyResult.status !== 0) throw new Error(`Could not retrieve Supabase public key: ${keyResult.stderr.trim()}`);
const output = keyResult.stdout.trim();
const jsonStart = Math.min(...['[', '{'].map((token) => { const index = output.indexOf(token); return index < 0 ? Number.POSITIVE_INFINITY : index; }));
const parsed = JSON.parse(output.slice(jsonStart));
const keys = Array.isArray(parsed) ? parsed : parsed.api_keys ?? parsed.keys ?? [];
const publicEntry = keys.find((entry) => entry.name === 'anon') ?? keys.find((entry) => entry.type === 'publishable') ?? keys.find((entry) => String(entry.name ?? '').includes('publishable'));
const publicKey = publicEntry?.api_key ?? publicEntry?.key ?? publicEntry?.value;
if (!publicKey) throw new Error('No Supabase public key was returned.');

const url = `https://${projectRef}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const ownerClient = createClient(url, publicKey, options);
const ownerAuth = await ownerClient.auth.signInAnonymously();
if (ownerAuth.error) throw new Error(`Anonymous authentication failed: ${ownerAuth.error.message}`);
const token = ownerAuth.data.session?.access_token;
if (!token) throw new Error('Anonymous authentication returned no session token.');

const state = {
  version: 1,
  seed: 483,
  time: 400,
  chapter: 5,
  creatures: [{ id: 'verify-c1', alive: true }],
  buildings: [],
  resources: { glow: 80, alloy: 35 },
  pollution: new Array(24 * 16).fill(0),
  pollutionWidth: 24,
  pollutionHeight: 16,
  technologies: [],
  completedObjectives: [],
  dialogueHistory: ['ending'],
  profile: { empathy: 1, exploitation: 0, sustainability: 1, curiosity: 1, ambition: 0, obedience: 0, aggression: 0, honesty: 1 },
  events: [],
  deaths: 0,
  populationPeak: 1,
  endingId: 'release'
};

const saveResponse = await fetch(`${productionUrl}/api/functions/save-game`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: publicKey },
  body: JSON.stringify({ slot: 1, state, events: [] })
});
if (!saveResponse.ok) throw new Error(`Vercel save proxy failed (${saveResponse.status}): ${await saveResponse.text()}`);
const saved = await saveResponse.json();
if (!saved.id) throw new Error('Save proxy returned no save ID.');

const ownerRead = await ownerClient.from('save_games').select('id,world_state').eq('id', saved.id).single();
if (ownerRead.error || ownerRead.data?.world_state?.endingId !== 'release') throw new Error(`Owner save reload failed: ${ownerRead.error?.message ?? 'state mismatch'}`);

const otherClient = createClient(url, publicKey, options);
const otherAuth = await otherClient.auth.signInAnonymously();
if (otherAuth.error) throw new Error(`Second anonymous authentication failed: ${otherAuth.error.message}`);
const otherRead = await otherClient.from('save_games').select('id').eq('id', saved.id).maybeSingle();
if (otherRead.error || otherRead.data) throw new Error(`RLS isolation failed: ${otherRead.error?.message ?? 'another user could read the save'}`);

const directWrite = await otherClient.from('leaderboard').insert({ display_name: 'should-be-denied', final_chapter: 5, ending_id: 'release', population_peak: 250, user_id: otherAuth.data.user?.id });
if (!directWrite.error) throw new Error('Direct leaderboard write unexpectedly succeeded.');

const profile = await ownerClient.functions.invoke('compute-profile', { body: { saveId: saved.id } });
if (profile.error || !profile.data?.profile) throw new Error(`Profile recomputation failed: ${profile.error?.message ?? 'no profile returned'}`);

const score = await ownerClient.functions.invoke('submit-score', { body: { saveId: saved.id, displayName: 'Production Check' } });
if (score.error || !score.data?.accepted) throw new Error(`Validated score submission failed: ${score.error?.message ?? 'not accepted'}`);

const publicClient = createClient(url, publicKey, options);
const leaderboard = await publicClient.from('leaderboard').select('display_name,ending_id,population_peak').eq('display_name', 'Production Check');
if (leaderboard.error || leaderboard.data.length < 1) throw new Error(`Public leaderboard read failed: ${leaderboard.error?.message ?? 'verification entry not found'}`);

console.log(JSON.stringify({
  anonymousAuth: 'passed',
  vercelSaveProxy: 'passed',
  ownerReload: 'passed',
  crossUserRls: 'passed',
  directLeaderboardWriteDenied: 'passed',
  serverProfile: 'passed',
  validatedScore: 'passed',
  publicLeaderboardRead: 'passed'
}, null, 2));
