import { requireAdmin } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (!env.MEDIA) return Response.json({ error: 'Хранилище R2 не подключено' }, { status: 503 });
  const form = await request.formData();
  const file = form.get('image');
  if (!(file instanceof File) || !file.size) return Response.json({ error: 'Выберите изображение' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'Размер изображения не должен превышать 5 МБ' }, { status: 413 });
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return Response.json({ error: 'Разрешены JPG, PNG и WEBP' }, { status: 415 });
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `news/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return Response.json({ ok: true, image_key: key });
}
