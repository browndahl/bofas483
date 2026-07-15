import { createClient } from 'npm:@supabase/supabase-js@2.50.0';

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

export async function authenticatedUser(req: Request) {
  const auth = req.headers.get('Authorization'); if (!auth) return null;
  const client = adminClient(); const { data } = await client.auth.getUser(auth.replace(/^Bearer\s+/i, '')); return data.user;
}
