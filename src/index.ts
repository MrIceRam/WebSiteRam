import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ADMIN_PASSWORD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============ Проверка пароля (middleware) ============

const requireAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const password = authHeader?.replace('Bearer ', '');

  if (!password || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// ============ Notes / Закладки ============

app.get('/api/notes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC'
  ).all();
  return c.json(results);
});

app.get('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?')
    .bind(id)
    .first();
  if (!note) return c.json({ error: 'Note not found' }, 404);
  return c.json(note);
});

app.post('/api/notes', requireAuth, async (c) => {
  const body = await c.req.json<{ title?: string; content?: string }>();
  const title = body.title?.trim();
  if (!title) return c.json({ error: 'Title is required' }, 400);

  const result = await c.env.DB.prepare(
    'INSERT INTO notes (title, content) VALUES (?, ?)'
  )
    .bind(title, body.content ?? '')
    .run();

  return c.json({ id: result.meta.last_row_id, title, content: body.content ?? '' }, 201);
});

app.put('/api/notes/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ title?: string; content?: string }>();
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);

  await c.env.DB.prepare(
    'UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  )
    .bind(body.title, body.content ?? '', id)
    .run();

  return c.json({ success: true });
});

app.delete('/api/notes/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ============ Картинки (Images) ============

app.get('/api/images', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, filename, alt, size, content_type, created_at FROM images ORDER BY created_at DESC'
  ).all();
  return c.json(results);
});

app.get('/api/images/:id/file', async (c) => {
  const id = c.req.param('id');
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?')
    .bind(id)
    .first<{ key: string; content_type: string | null }>();

  if (!image) return c.json({ error: 'Image not found' }, 404);

  const obj = await c.env.IMAGES.get(image.key);
  if (!obj) return c.json({ error: 'File missing in R2' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': image.content_type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

app.post('/api/images', requireAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');
  const alt = (formData.get('alt') as string | null) ?? '';

  if (!(file instanceof File)) {
    return c.json({ error: 'Field "file" is required' }, 400);
  }
  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'Only images are allowed' }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 10 MB)' }, 400);
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `images/${crypto.randomUUID()}.${ext}`;

  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const result = await c.env.DB.prepare(
    'INSERT INTO images (key, filename, alt, size, content_type) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(key, file.name, alt, file.size, file.type)
    .run();

  return c.json({ id: result.meta.last_row_id, key, filename: file.name }, 201);
});

app.delete('/api/images/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const image = await c.env.DB.prepare('SELECT key FROM images WHERE id = ?')
    .bind(id)
    .first<{ key: string }>();

  if (!image) return c.json({ error: 'Not found' }, 404);

  await c.env.IMAGES.delete(image.key);
  await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// ============ YouTube metadata ============

app.post('/api/youtube-batch', async (c) => {
  const body = await c.req.json<{ urls?: string[] }>();
  const urls = body.urls;

  if (!Array.isArray(urls) || urls.length === 0) {
    return c.json({ error: 'urls array is required' }, 400);
  }
  if (urls.length > 50) {
    return c.json({ error: 'Too many URLs (max 50 per request)' }, 400);
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const res = await fetch(oembedUrl);

        if (!res.ok) {
          return { url, error: `YouTube responded ${res.status}` };
        }

        const data = await res.json<{
          title: string;
          author_name: string;
          thumbnail_url: string;
        }>();

        return {
          url,
          title: data.title,
          author: data.author_name,
          thumbnail: data.thumbnail_url,
        };
      } catch (e) {
        return { url, error: String(e) };
      }
    })
  );

  return c.json(results);
});

export default app;