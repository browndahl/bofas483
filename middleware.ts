export const config = { matcher: ['/api/functions/:path*'] };

async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true, retryAfter: 0 };
  const response = await fetch(`${url}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds, 'NX'], ['TTL', key]]) });
  const results = await response.json() as Array<{ result: number }>;
  return { allowed: Number(results[0]?.result ?? 0) <= limit, retryAfter: Math.max(1, Number(results[2]?.result ?? windowSeconds)) };
}

export default async function middleware(request: Request) {
  const url = new URL(request.url); const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const global = await rateLimit(`bofas483:global:${ip}`, 20, 60);
  if (!global.allowed) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(global.retryAfter) } });
  const functionName = url.pathname.split('/').pop(); const authorization = request.headers.get('authorization') ?? ip;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization));
  const identity = [...new Uint8Array(digest)].slice(0, 10).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const rule = functionName === 'save-game' ? { limit: 1, seconds: 5 } : functionName === 'submit-score' ? { limit: 5, seconds: 60 } : { limit: 30, seconds: 60 };
  const result = await rateLimit(`bofas483:${functionName}:${identity}`, rule.limit, rule.seconds);
  if (!result.allowed) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(result.retryAfter) } });
  return undefined;
}
