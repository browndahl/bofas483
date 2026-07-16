import { describe, expect, it } from 'vitest';
import { authRedirectUrl, clearAuthRedirectError, parseAuthRedirectError } from '../src/services/authRedirect';

describe('authentication redirects', () => {
  it('returns confirmations to the current deployment callback route', () => {
    expect(authRedirectUrl('https://bofas483-project.vercel.app')).toBe('https://bofas483-project.vercel.app/auth/callback');
    expect(authRedirectUrl('http://localhost:4830')).toBe('http://localhost:4830/auth/callback');
  });

  it('translates an expired Supabase link into a recoverable message', () => {
    const notice = parseAuthRedirectError('https://game.test/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(notice?.code).toBe('otp_expired');
    expect(notice?.message).toContain('request a fresh confirmation');
  });

  it('removes stale auth errors without changing the application route', () => {
    expect(clearAuthRedirectError('https://game.test/auth/callback?mode=identity#error=access_denied&error_code=otp_expired'))
      .toBe('/auth/callback?mode=identity');
  });
});
