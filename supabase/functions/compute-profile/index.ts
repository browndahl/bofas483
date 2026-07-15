import { z } from 'npm:zod@3.25.67';
import { adminClient, authenticatedUser } from '../_shared/client.ts';
import { json, options, safe } from '../_shared/http.ts';

const schema = z.object({ saveId: z.string().uuid() });
const dimensions = ['empathy', 'exploitation', 'sustainability', 'curiosity', 'ambition', 'obedience', 'aggression', 'honesty'] as const;

Deno.serve((req) => options(req) ?? safe(async () => {
  const user = await authenticatedUser(req); if (!user) return json({ error: 'Unauthorized' }, 401);
  const parsed = schema.safeParse(await req.json()); if (!parsed.success) return json({ error: 'Invalid profile request' }, 400);
  const admin = adminClient(); const { data: save } = await admin.from('save_games').select('id').eq('id', parsed.data.saveId).eq('user_id', user.id).single(); if (!save) return json({ error: 'Save not found' }, 404);
  const { data: events, error } = await admin.from('event_log').select('event_type,payload').eq('save_id', save.id).eq('user_id', user.id).order('id'); if (error) throw error;
  const result = Object.fromEntries(dimensions.map((d) => [d, 0])) as Record<(typeof dimensions)[number], number>;
  for (const event of events ?? []) {
    if (event.event_type.startsWith('manual_')) result.empathy += 0.15;
    if (event.event_type === 'creature_death') result.empathy -= 1;
    if (event.event_type === 'place_building') { if (event.payload.kind === 'extractor') { result.ambition += 2; result.sustainability -= 1; } else result.sustainability += 0.5; }
    if (event.event_type === 'dialogue_choice' && event.payload.effects && typeof event.payload.effects === 'object') for (const key of dimensions) result[key] += Number((event.payload.effects as Record<string, unknown>)[key] ?? 0);
  }
  await admin.from('save_games').update({ player_profile: result }).eq('id', save.id); return json({ profile: result });
}));
