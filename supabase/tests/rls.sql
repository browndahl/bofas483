begin;
select plan(4);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now(), '{}', '{}', now(), now());
insert into public.save_games (user_id, slot, world_state, creatures, buildings, pollution_map, technology, milestones, dialogue_history, player_profile, chapter)
values
  ('00000000-0000-0000-0000-000000000001', 1, '{}', '[]', '[]', '[]', '[]', '[]', '[]', '{}', 1),
  ('00000000-0000-0000-0000-000000000002', 1, '{}', '[]', '[]', '[]', '[]', '[]', '[]', '{}', 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.save_games), 1, 'user sees only their own save');
select is((select count(*)::int from public.save_games where user_id = '00000000-0000-0000-0000-000000000002'), 0, 'user cannot read another save');
select throws_ok($$insert into public.save_games (user_id, slot, world_state, creatures, buildings, pollution_map, technology, milestones, dialogue_history, player_profile) values ('00000000-0000-0000-0000-000000000002', 2, '{}','[]','[]','[]','[]','[]','[]','{}')$$, '42501', null, 'client cannot directly insert saves');
select throws_ok($$insert into public.leaderboard (user_id, display_name, final_chapter, ending_id, population_peak) values ('00000000-0000-0000-0000-000000000001','bad',5,'release',250)$$, '42501', null, 'client cannot directly write leaderboard');
select * from finish();
rollback;
