const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createSession(secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const signature = toBase64Url(await sign(payload, secret));
  return `${payload}.${signature}`;
}

export async function isAuthorized(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)sapsan_session=([^;]+)/);
  if (!match) return false;
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return false;
  try {
    const expected = await sign(payload, secret);
    const actual = fromBase64Url(signature);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    if (diff !== 0) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

export function sessionCookie(token, maxAge = 8 * 60 * 60) {
  return `sapsan_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return 'sapsan_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

export async function requireAdmin(request, env) {
  if (!env.SESSION_SECRET || !(await isAuthorized(request, env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: 'Требуется вход администратора' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  return null;
}
