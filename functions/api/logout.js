import { clearSessionCookie } from '../_shared/auth.js';
export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': clearSessionCookie() }
  });
}
