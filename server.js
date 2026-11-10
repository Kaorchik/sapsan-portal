
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;

const OWNER = process.env.GITHUB_OWNER || 'Kaorchik';
const REPO = process.env.GITHUB_REPO || 'sapsan-portal';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

const TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

const DATA_FILE = 'data/posts.json';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Запрещаем доступ к серверным файлам и внутренним данным.
app.use([
  '/functions',
  '/schema.sql',
  '/package.json',
  '/package-lock.json',
  '/server.js',
  '/data',
  '/node_modules',
  '/.git',
  '/.env'
], (req, res) => {
  res.sendStatus(404);
});

// Настройки загрузки фотографий.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Настройки сессионной cookie.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  };
}

// Подпись сессии.
function sign(value) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(value)
    .digest('base64url');
}

function makeSession() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + 8 * 60 * 60 * 1000
  })).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

// Проверка авторизации.
function authorized(req) {
  if (!SESSION_SECRET) return false;

  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)sapsan_session=([^;]+)/);

  if (!match) return false;

  const [payload, signature] = match[1].split('.');

  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );

    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!authorized(req)) {
    return res.status(401).json({
      error: 'Требуется вход администратора'
    });
  }

  next();
}

// Работа с GitHub Contents API.
async function githubRequest(path, options = {}) {
  if (!TOKEN) {
    throw new Error('Не настроен GITHUB_TOKEN');
  }

  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      }
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }

  return response.status === 204
    ? null
    : response.json();
}

// Чтение публикаций.
async function readPosts() {
  try {
    const file = await githubRequest(DATA_FILE);

    const content = Buffer.from(
      file.content,
      'base64'
    ).toString('utf8');

    const posts = JSON.parse(content);

    if (!Array.isArray(posts)) {
      throw new Error('Файл posts.json должен содержать массив');
    }

    return {
      posts,
      sha: file.sha
    };
  } catch (error) {
    if (String(error.message).includes('404')) {
      return {
        posts: [],
        sha: null
      };
    }

    throw error;
  }
}

// Сохранение публикаций.
async function savePosts(posts, sha) {
  const content = Buffer.from(
    JSON.stringify(posts, null, 2)
  ).toString('base64');

  await githubRequest(DATA_FILE, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Update Sapsan news',
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
}

// Вход администратора.
app.post('/api/login', (req, res) => {
  if (!ADMIN_PASSWORD || !SESSION_SECRET) {
    return res.status(503).json({
      error: 'Не настроены ADMIN_PASSWORD и SESSION_SECRET'
    });
  }

  const supplied = String(req.body?.password || '');

  const a = crypto
    .createHash('sha256')
    .update(supplied)
    .digest();

  const b = crypto
    .createHash('sha256')
    .update(ADMIN_PASSWORD)
    .digest();

  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      error: 'Неверный пароль'
    });
  }

  res.cookie(
    'sapsan_session',
    makeSession(),
    cookieOptions()
  );

  res.json({ ok: true });
});

// Выход администратора.
app.post('/api/logout', (req, res) => {
  res.clearCookie('sapsan_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/'
  });

  res.json({ ok: true });
});

// Публичный список опубликованных новостей.
app.get('/api/posts', async (req, res) => {
  try {
    const { posts } = await readPosts();

    res.set('Cache-Control', 'no-store');

    res.json(
      posts.filter(post => post.published !== false)
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Не удалось загрузить новости'
    });
  }
});

// Все публикации для администратора.
app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  try {
    const { posts } = await readPosts();

    res.json(posts);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Не удалось загрузить публикации'
    });
  }
});

// Загрузка фотографии в GitHub.
app.post(
  '/api/upload',
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          error: 'Выберите фотографию'
        });
      }

      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ];

      if (!allowed.includes(file.mimetype)) {
        return res.status(415).json({
          error: 'Разрешены JPG, PNG и WEBP'
        });
      }

      const ext = file.mimetype === 'image/jpeg'
        ? 'jpg'
        : file.mimetype.split('/')[1];

      const key = `uploads/news/${crypto.randomUUID()}.${ext}`;

      await githubRequest(key, {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Upload Sapsan news image',
          content: file.buffer.toString('base64'),
          branch: BRANCH
        })
      });

      res.json({
        ok: true,
        image_key: key,
        image_url: `/media/${key}`
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Не удалось загрузить фотографию'
      });
    }
  }
);

// Выдача фотографий из GitHub через сервер.
app.get('/media/*', async (req, res) => {
  try {
    const key = req.params[0];

    if (
      !/^uploads\/news\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(key)
    ) {
      return res.sendStatus(404);
    }

    const file = await githubRequest(key);

    if (!file.download_url) {
      return res.sendStatus(404);
    }

    const imageResponse = await fetch(file.download_url);

    if (!imageResponse.ok) {
      return res.sendStatus(404);
    }

    const contentType = {
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    }[key.split('.').pop()];

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    });

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    res.send(imageBuffer);
  } catch (error) {
    console.error(error);
    res.sendStatus(404);
  }
});

// Создание публикации.
app.post('/api/posts', requireAdmin, async (req, res) => {
  try {
    const title = String(req.body.title || '')
      .trim()
      .slice(0, 140);

    const body = String(req.body.body || '')
      .trim()
      .slice(0, 12000);

    const category = String(req.body.category || 'Новости')
      .slice(0, 50);

    const imageKey = req.body.image_key || null;

    if (!title || !body) {
      return res.status(400).json({
        error: 'Заполните заголовок и текст'
      });
    }

    const { posts, sha } = await readPosts();

    const post = {
      id: crypto.randomUUID(),
      title,
      body,
      category,
      image_key: imageKey,
      image_url: imageKey ? `/media/${imageKey}` : null,
      published: true,
      created_at: new Date().toISOString()
    };

    posts.unshift(post);

    await savePosts(posts, sha);

    res.json({
      ok: true,
      id: post.id
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Не удалось сохранить публикацию'
    });
  }
});

// Редактирование публикации.
app.put('/api/posts', requireAdmin, async (req, res) => {
  try {
    const { posts, sha } = await readPosts();

    const id = String(req.body.id || '');

    const post = posts.find(item => item.id === id);

    if (!post) {
      return res.status(404).json({
        error: 'Новость не найдена'
      });
    }

    post.title = String(req.body.title || '')
      .trim()
      .slice(0, 140);

    post.body = String(req.body.body || '')
      .trim()
      .slice(0, 12000);

    post.category = String(req.body.category || 'Новости')
      .slice(0, 50);

    if (req.body.image_key) {
      post.image_key = req.body.image_key;
      post.image_url = `/media/${req.body.image_key}`;
    }

    if (!post.title || !post.body) {
      return res.status(400).json({
        error: 'Заполните заголовок и текст'
      });
    }

    await savePosts(posts, sha);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Не удалось изменить публикацию'
    });
  }
});

// Удаление публикации.
app.delete('/api/posts', requireAdmin, async (req, res) => {
  try {
    const { posts, sha } = await readPosts();

    const filtered = posts.filter(
      post => post.id !== req.body.id
    );

    if (filtered.length === posts.length) {
      return res.status(404).json({
        error: 'Новость не найдена'
      });
    }

    await savePosts(filtered, sha);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Не удалось удалить публикацию'
    });
  }
});

// Раздача публичных файлов сайта.
// Этот блок должен находиться после защиты и API-маршрутов.
app.use(express.static('.', {
  index: 'index.html',
  dotfiles: 'deny',
  setHeaders(res, path) {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sapsan server started on port ${PORT}`);
});
