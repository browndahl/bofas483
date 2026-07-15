import * as Sentry from 'npm:@sentry/deno@8.55.0';

const sentryDsn = Deno.env.get('SENTRY_DSN');
if (sentryDsn) Sentry.init({ dsn: sentryDsn });

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json'
};

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...headers } });
}

export function options(req: Request) { return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null; }

export async function safe(handler: () => Promise<Response>) {
  try { return await handler(); }
  catch (error) { Sentry.captureException(error); await Sentry.flush(1500); console.error(JSON.stringify({ level: 'error', message: error instanceof Error ? error.message : 'unknown' })); return json({ error: 'The habitat could not complete this request.' }, 500); }
}
