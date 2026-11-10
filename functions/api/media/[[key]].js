export async function onRequestGet({ params, env }) {
  if (!env.MEDIA) return new Response('Хранилище изображений не подключено', { status: 503 });
  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!key.startsWith('news/')) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}
