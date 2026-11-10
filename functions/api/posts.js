import { requireAdmin } from '../_shared/auth.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: 'База данных D1 не подключена' }, { status: 503 });
  const { results } = await env.DB.prepare(
    'SELECT id, title, body, category, image_key, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 60'
  ).all();
  const posts = (results || []).map(post => ({ ...post, image_url: post.image_key ? `/api/media/${post.image_key.split('/').map(encodeURIComponent).join('/')}` : null }));
  return Response.json(posts, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

export async function onRequestPost({ request, env }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.DB) return Response.json({ error: 'База данных D1 не подключена' }, { status: 503 });
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'Некорректный JSON' }, { status: 400 }); }
  const title = String(data.title || '').trim().slice(0, 140);
  const body = String(data.body || '').trim().slice(0, 12000);
  const category = String(data.category || 'Новости').trim().slice(0, 50);
  const image_key = data.image_key ? String(data.image_key).slice(0, 200) : null;
  if (!title || !body) return Response.json({ error: 'Заполните заголовок и текст новости' }, { status: 400 });
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.prepare('INSERT INTO posts (id, title, body, category, image_key, published, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
    .bind(id, title, body, category, image_key, created_at).run();
  return Response.json({ ok: true, id, created_at });
}

export async function onRequestDelete({ request, env }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.DB) return Response.json({ error: 'База данных D1 не подключена' }, { status: 503 });
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'Некорректный JSON' }, { status: 400 }); }
  const id = String(data.id || '');
  if (!id) return Response.json({ error: 'Не указан ID новости' }, { status: 400 });
  const post = await env.DB.prepare('SELECT image_key FROM posts WHERE id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  if (post?.image_key && env.MEDIA) await env.MEDIA.delete(post.image_key);
  return Response.json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.DB) return Response.json({ error: 'База данных D1 не подключена' }, { status: 503 });
  let data;
  try { data = await request.json(); } catch { return Response.json({ error: 'Некорректный JSON' }, { status: 400 }); }
  const id = String(data.id || '');
  const title = String(data.title || '').trim().slice(0, 140);
  const body = String(data.body || '').trim().slice(0, 12000);
  const category = String(data.category || 'Новости').trim().slice(0, 50);
  const image_key = data.image_key ? String(data.image_key).slice(0, 200) : null;
  if (!id || !title || !body) return Response.json({ error: 'Заполните заголовок и текст новости' }, { status: 400 });
  const old = await env.DB.prepare('SELECT image_key FROM posts WHERE id = ?').bind(id).first();
  if (!old) return Response.json({ error: 'Новость не найдена' }, { status: 404 });
  await env.DB.prepare('UPDATE posts SET title = ?, body = ?, category = ?, image_key = ? WHERE id = ?')
    .bind(title, body, category, image_key, id).run();
  if (old.image_key && old.image_key !== image_key && env.MEDIA) await env.MEDIA.delete(old.image_key);
  return Response.json({ ok: true });
}
