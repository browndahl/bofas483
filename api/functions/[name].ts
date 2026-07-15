export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return new Response(JSON.stringify({ error: 'Backend not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const name = new URL(request.url).pathname.split('/').pop();
  if (!['save-game', 'submit-score', 'compute-profile', 'health'].includes(name ?? '')) return new Response('Not found', { status: 404 });
  const headers = new Headers(request.headers); headers.delete('host');
  return fetch(`${supabaseUrl}/functions/v1/${name}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
}
