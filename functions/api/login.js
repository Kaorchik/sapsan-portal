import { createSession, sessionCookie } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return Response.json({ error: 'Администратор ещё не настроен. Добавьте секреты ADMIN_PASSWORD и SESSION_SECRET в Cloudflare.' }, { status: 503 });
  }
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const supplied = String(data.password || '');
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const a = await digest(supplied);
  const b = await digest(env.ADMIN_PASSWORD);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return Response.json({ error: 'Неверный пароль' }, { status: 401 });
  const token = await createSession(env.SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': sessionCookie(token) }
  });
}
