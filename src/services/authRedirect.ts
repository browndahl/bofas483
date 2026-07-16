export interface AuthRedirectNotice {
  code: string;
  message: string;
}

const AUTH_QUERY_KEYS = ['error', 'error_code', 'error_description'];

export function authRedirectUrl(origin: string): string {
  return new URL('/auth/callback', origin).toString();
}

export function parseAuthRedirectError(value: string): AuthRedirectNotice | null {
  const url = new URL(value);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const code = hash.get('error_code') ?? url.searchParams.get('error_code') ?? hash.get('error') ?? url.searchParams.get('error');
  if (!code) return null;
  const description = hash.get('error_description') ?? url.searchParams.get('error_description') ?? '';
  const message = code === 'otp_expired'
    ? 'That confirmation link expired or was already used. Enter your email below and request a fresh confirmation.'
    : description.replace(/\+/g, ' ') || 'The identity link could not be completed. Request a fresh confirmation and try again.';
  return { code, message };
}

export function clearAuthRedirectError(value: string): string {
  const url = new URL(value);
  url.hash = '';
  AUTH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}`;
}
