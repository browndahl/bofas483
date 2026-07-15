import { adminClient } from '../_shared/client.ts';
import { json, options, safe } from '../_shared/http.ts';

Deno.serve((req) => options(req) ?? safe(async () => {
  const started = Date.now(); const { error } = await adminClient().from('leaderboard').select('id', { head: true, count: 'exact' }).limit(1);
  if (error) return json({ status: 'degraded', database: false }, 503);
  return json({ status: 'ok', database: true, latencyMs: Date.now() - started });
}));
