# bofas483 // The Lumen Audit

An original, installable web simulation about a colony of bioluminescent information organisms that learns what humanity is from the way you treat it.

The MVP is a complete playable arc: begin with Pip-01, care by touch, sustain reproduction, place six autonomous buildings, gather glow and alloy, industrialize, watch pollution spread, confront illness and persistent bodies, answer eight ethical conversations, and receive a profile-driven verdict with release and custody endings.

## Run locally

Requirements: Node 22+, npm 10+.

```bash
npm install
npm run dev
```

Open `http://localhost:4830`. The game works without cloud configuration and saves to the single namespaced key `bofas483.save.v1`. Copy `.env.example` to `.env.local` to enable Supabase.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## Architecture

- Phaser renders an original bundled pixel-art habitat, procedural actors and structures, pooled effects, synthesized interaction tones, responsive HUD, dialogue, audits, and fiction-contained glitches.
- Typed creature/building state is independent of Phaser objects. A Web Worker advances needs, inherited personalities, friendships, comfort behavior, autonomous tasks, movement, exposure, reproduction, pollution, work, illness, and death on a measured five-Hz cadence; Phaser interpolates state deltas.
- Active buildings are grouped by kind once per simulation step. A spatial grid bounds nearby-agent searches, while cached navigation grids route creatures around habitat scenery and player structures. Rendering culls off-camera creature views, limits ambient thoughts as the colony grows, and hides most labels at scale. The worker keeps agents as plain data behind a 250-creature cap and relationship histories retain only each creature's eight strongest bonds.
- Zod validates local and cloud save data before hydration. Event history is capped, objective rewards are idempotent, and legacy raw local saves remain compatible.
- Supabase handles anonymous, email/password, and Google auth; private saves and event logs use RLS. Sensitive writes go exclusively through validated Edge Functions using the service role.
- Vercel serves immutable hashed assets through its CDN, provides CSP/security headers and an Upstash-backed Edge Middleware limiter, and proxies sensitive function calls.
- The PWA service worker caches the shell and bundled art for repeat and offline play. Cloud features degrade to a local save when offline.

Dedicated always-on compute is deliberately absent. Simulation cost stays on the player's worker; Supabase Edge Functions only validate infrequent saves/profile/score calls and Supavisor pools database connections. Vercel and Supabase provide horizontal edge/function scaling.

## Supabase production setup

1. Create a Supabase project. In Auth settings enable anonymous users, email/password, and leaked-password protection. Configure Google with its client credentials and add the production URL plus `https://<project>.supabase.co/auth/v1/callback` as authorized redirects.
2. Require SSL in Database settings. Enable daily backups; enable point-in-time recovery on a qualifying plan.
3. Install the Supabase CLI and run:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy save-game submit-score compute-profile health
supabase secrets set ALLOWED_ORIGIN=https://YOUR_DOMAIN SENTRY_DSN=YOUR_EDGE_DSN
```

The platform automatically injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into functions. Never place the service key in Vercel, GitHub client build variables, or any `VITE_*` value. The migration creates indexes, RLS policies, the profile trigger, and a 2 MB image-only `ending-cards` storage bucket with owner-scoped writes.

Backend database/Auth logs are under Supabase Dashboard → Logs. Function invocation logs are under Edge Functions → Logs.

## Vercel, rate limiting, and CDN

Import the GitHub repository into Vercel and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_PROXY_URL=https://YOUR_DOMAIN/api/functions`
- `VITE_SENTRY_DSN` (optional)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The middleware enforces one `save-game` request per five seconds per identity, five `submit-score` requests per minute, and a global 20 requests/minute IP ceiling. It responds with `429` and `Retry-After`; the game translates this to a friendly toast. Asset headers use a one-year immutable cache. Public leaderboard responses are designed for 45-second `s-maxage` with stale-while-revalidate.

Vercel deploys `main` to production and pull requests to previews when its Git integration is enabled. Instant rollback is available from Vercel → Project → Deployments → a known-good deployment → Promote to Production.

## GitHub CI/CD

CI installs from lockfile, type-checks, lints, runs Vitest simulation/security contracts, builds production assets, starts a Supabase shadow stack, lints migrations, and runs pgTAP RLS tests. The production workflow applies migrations and deploys all functions after merges to `main`. Add these GitHub environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

In GitHub → Settings → Branches, protect `main`, require the `app` CI job, require pull requests, dismiss stale approvals, and block force pushes.

## Monitoring and recovery

Register `https://YOUR_PROJECT.supabase.co/functions/v1/health` in Better Stack or UptimeRobot at a five-minute interval with email alerting. The health function checks a real database query and returns `503` when degraded. Sentry captures main-thread and worker errors; Edge Functions catch, report, flush, and return sanitized responses. Development-only state inspection is exposed through `window.gameStore`; it is tree-shaken from the production path.

Restore procedure:

1. Put the Vercel project in maintenance mode or temporarily disable writes.
2. In Supabase Database → Backups, restore the latest daily backup or choose a PITR timestamp immediately before the incident.
3. Run the health check, compare migration history with `supabase migration list`, and replay missing safe migrations.
4. Re-enable writes and verify a new guest save, reload, score submission, public leaderboard read, and denied direct leaderboard insert.
5. For a frontend-only regression, promote the previous Vercel deployment; no database action is required.

## Verification checklist

- Desktop, narrow portrait, drag pan, wheel/pinch zoom, and touch targets.
- Feed/wash/play changes visible need bars and creature expressions.
- Objective completion pays its displayed GLOW reward exactly once.
- Sustained high needs divide a Luma; autonomous buildings serve matching tasks.
- Personalities remain stable across reloads, children inherit a blend of parent traits, and nearby Luma socialize or comfort distressed friends.
- Thought bubbles explain current intent; pink links show friendship and green links show active comfort.
- Creatures route around major rocks, water, and structures instead of crossing them.
- Building previews reject overlaps, protected scenery, and interface areas; Escape and right-click cancel placement.
- Deep Takers produce resources and visible pollution; exposure damages health and bodies remain.
- Local autosave survives reload; guest cloud save can be linked to email; Google OAuth redirects back safely.
- Edge validation rejects malformed saves and physically impossible leaderboard jumps.
- RLS allows only owner reads for saves/events; direct sensitive writes are revoked; leaderboard is public-read.

## Originality and safety

All names, setting, dialogue, interface composition, SVG icons, procedural shapes, effects, and generated tones in this repository are original to bofas483. The glitches are canvas-only visual effects. The application reads and writes no browser storage except its own save key and Supabase's namespaced auth session.
