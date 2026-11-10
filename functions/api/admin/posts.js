import { requireAdmin } from '../../_shared/auth.js';
export async function onRequestGet({ request, env }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.DB) return Response.json({ error: 'База данных D1 не подключена' }, { status: 503 });
  const { results } = await env.DB.prepare('SELECT id, title, body, category, image_key, created_at FROM posts ORDER BY created_at DESC LIMIT 100').all();
  return Response.json((results || []).map(post => ({ ...post, image_url: post.image_key ? `/api/media/${post.image_key.split('/').map(encodeURIComponent).join('/')}` : null })));
}
