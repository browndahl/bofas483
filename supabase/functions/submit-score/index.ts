import { z } from 'npm:zod@3.25.67';
import { adminClient, authenticatedUser } from '../_shared/client.ts';
import { json, options, safe } from '../_shared/http.ts';

const bodySchema = z.object({ saveId: z.string().uuid(), displayName: z.string().trim().min(1).max(40) });

Deno.serve((req) => options(req) ?? safe(async () => {
  const user = await authenticatedUser(req); if (!user) return json({ error: 'Unauthorized' }, 401);
  const parsed = bodySchema.safeParse(await req.json()); if (!parsed.success) return json({ error: 'Invalid score payload' }, 400);
  const admin = adminClient();
  const { data: save, error } = await admin.from('save_games').select('id,user_id,world_state,chapter,updated_at').eq('id', parsed.data.saveId).eq('user_id', user.id).single();
  if (error || !save) return json({ error: 'Save not found' }, 404);
  const world = save.world_state as { time?: number; populationPeak?: number; endingId?: string; creatures?: unknown[]; resources?: { glow?: number; alloy?: number } };
  const peak = Math.floor(world.populationPeak ?? world.creatures?.length ?? 0); const playSeconds = Number(world.time ?? 0);
  const physicallyPossiblePopulation = 1 + Math.floor(playSeconds / 20) * 2;
  if (peak < 1 || peak > 250 || peak > physicallyPossiblePopulation || (world.resources?.glow ?? 0) > playSeconds * 1000 + 10000 || !['release', 'custody'].includes(world.endingId ?? '')) return json({ error: 'Implausible score rejected' }, 422);
  const { error: insertError } = await admin.from('leaderboard').insert({ user_id: user.id, display_name: parsed.data.displayName.replace(/[<>]/g, ''), final_chapter: save.chapter, ending_id: world.endingId, population_peak: peak });
  if (insertError) throw insertError; return json({ accepted: true });
}));
