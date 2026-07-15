import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202607150001_initial_schema.sql', import.meta.url), 'utf8').toLowerCase();

describe('database security contract', () => {
  it('enables RLS on every application table', () => {
    for (const table of ['profiles', 'save_games', 'event_log', 'leaderboard']) expect(migration).toContain(`alter table public.${table} enable row level security`);
  });
  it('scopes private reads to the authenticated user', () => {
    expect(migration).toMatch(/save games select own[\s\S]*auth\.uid\(\) = user_id/); expect(migration).toMatch(/event log select own[\s\S]*auth\.uid\(\) = user_id/);
  });
  it('makes leaderboard public-read and denies direct writes', () => {
    expect(migration).toMatch(/leaderboard public read[\s\S]*using \(true\)/); expect(migration).toContain('revoke insert, update, delete on public.leaderboard from anon, authenticated');
  });
});
