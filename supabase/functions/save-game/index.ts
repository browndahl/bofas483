import { z } from 'npm:zod@3.25.67';
import { adminClient, authenticatedUser } from '../_shared/client.ts';
import { json, options, safe } from '../_shared/http.ts';

const profile = z.object({ empathy: z.number(), exploitation: z.number(), sustainability: z.number(), curiosity: z.number(), ambition: z.number(), obedience: z.number(), aggression: z.number(), honesty: z.number() });
const stateSchema = z.object({
  version: z.literal(1), time: z.number().min(0).max(31_536_000), chapter: z.number().int().min(1).max(5),
  creatures: z.array(z.object({ id: z.string().max(50), alive: z.boolean() }).passthrough()).max(250),
  buildings: z.array(z.object({ id: z.string().max(50), kind: z.string().max(50) }).passthrough()).max(500),
  pollution: z.array(z.number().min(0).max(100)).max(4096), technologies: z.array(z.string().max(80)).max(100),
  completedObjectives: z.array(z.string().max(80)).max(100), dialogueHistory: z.array(z.string().max(80)).max(100),
  profile, events: z.array(z.unknown()).max(5000), resources: z.object({ glow: z.number().min(0).max(1e9), alloy: z.number().min(0).max(1e9) })
}).passthrough();
const bodySchema = z.object({ slot: z.number().int().min(1).max(3), state: stateSchema, events: z.array(z.object({ type: z.string().max(80), at: z.number(), payload: z.record(z.unknown()) })).max(250) });

Deno.serve((req) => options(req) ?? safe(async () => {
  const user = await authenticatedUser(req); if (!user) return json({ error: 'Unauthorized' }, 401);
  const parsed = bodySchema.safeParse(await req.json()); if (!parsed.success) return json({ error: 'Invalid save payload', details: parsed.error.flatten() }, 400);
  const { slot, state, events } = parsed.data; const admin = adminClient();
  const { data: save, error } = await admin.from('save_games').upsert({
    user_id: user.id, slot, world_state: state, creatures: state.creatures, buildings: state.buildings,
    pollution_map: state.pollution, technology: state.technologies, milestones: state.completedObjectives,
    dialogue_history: state.dialogueHistory, player_profile: state.profile, chapter: state.chapter, updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,slot' }).select('id,updated_at').single();
  if (error) throw error;
  if (events.length) {
    const rows = events.map((event) => ({ user_id: user.id, save_id: save.id, event_type: event.type, payload: event.payload, created_at: new Date(Date.now() - Math.max(0, state.time - event.at) * 1000).toISOString() }));
    const { error: eventError } = await admin.from('event_log').insert(rows); if (eventError) throw eventError;
  }
  return json({ id: save.id, updatedAt: save.updated_at });
}));
