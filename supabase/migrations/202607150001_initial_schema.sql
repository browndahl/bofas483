create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Unnamed Witness' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.save_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot int not null check (slot between 1 and 3),
  world_state jsonb not null,
  creatures jsonb not null,
  buildings jsonb not null,
  pollution_map jsonb not null,
  technology jsonb not null,
  milestones jsonb not null,
  dialogue_history jsonb not null,
  player_profile jsonb not null,
  chapter int not null default 1 check (chapter between 1 and 5),
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);

create table public.event_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  save_id uuid not null references public.save_games(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.leaderboard (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  final_chapter int not null check (final_chapter between 1 and 5),
  ending_id text not null check (ending_id in ('release', 'custody')),
  population_peak int not null check (population_peak between 1 and 250),
  submitted_at timestamptz not null default now()
);

create index save_games_user_id_idx on public.save_games(user_id);
create index event_log_save_id_idx on public.event_log(save_id);
create index leaderboard_rank_idx on public.leaderboard(final_chapter desc, population_peak desc);

alter table public.profiles enable row level security;
alter table public.save_games enable row level security;
alter table public.event_log enable row level security;
alter table public.leaderboard enable row level security;

-- This project is created with "Automatically expose new tables" disabled.
-- Grant only the API surface the browser actually needs; Edge Functions use
-- service_role for all validated state mutations.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.save_games, public.event_log to authenticated;
grant select on public.leaderboard to anon, authenticated;
grant all privileges on public.profiles, public.save_games, public.event_log, public.leaderboard to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "save games select own" on public.save_games for select using (auth.uid() = user_id);
create policy "event log select own" on public.event_log for select using (auth.uid() = user_id);
create policy "leaderboard public read" on public.leaderboard for select using (true);

revoke insert, update, delete on public.save_games from anon, authenticated;
revoke insert, update, delete on public.event_log from anon, authenticated;
revoke insert, update, delete on public.leaderboard from anon, authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Unnamed Witness'));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ending-cards', 'ending-cards', true, 2097152, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "ending cards public read" on storage.objects for select using (bucket_id = 'ending-cards');
create policy "ending cards own insert" on storage.objects for insert to authenticated with check (bucket_id = 'ending-cards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ending cards own update" on storage.objects for update to authenticated using (bucket_id = 'ending-cards' and (storage.foldername(name))[1] = auth.uid()::text);
