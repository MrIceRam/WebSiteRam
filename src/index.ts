import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  IMAGES_KV: KVNamespace;
  ADMIN_PASSWORD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============ Авторизация ============

const requireAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const password = authHeader?.replace('Bearer ', '');
  if (!password || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// ============ Утилиты ============

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2];
    }
  } catch {}
  return null;
}

async function fetchYouTubeMeta(url: string) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json<{ title: string; author_name: string; thumbnail_url: string }>();

    // Пытаемся достать дату публикации со страницы watch
    let publishedAt = '';
    try {
      const videoId = extractVideoId(url);
      if (videoId) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const pageRes = await fetch(watchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          // Пробуем несколько паттернов — YouTube меняет их время от времени
          const patterns = [
            /"publishDate":"([^"]+)"/,
            /"datePublished":"([^"]+)"/,
            /<meta\s+itemprop="datePublished"\s+content="([^"]+)"/,
            /"uploadDate":"([^"]+)"/,
          ];
          for (const p of patterns) {
            const m = html.match(p);
            if (m && m[1]) { publishedAt = m[1]; break; }
          }
        }
      }
    } catch { /* молча — если не получилось, оставляем '' */ }

    return {
      title: data.title || '',
      author: data.author_name || '',
      thumbnail: data.thumbnail_url || '',
      publishedAt,
    };
  } catch {
    return null;
  }
}

async function rebuildRelations(
  env: any,
  noteId: number,
  content: string,
  titleMap: Map<string, number>
) {
  await env.DB.prepare('DELETE FROM relations WHERE source_note_id = ?')
    .bind(noteId).run();

  const lines = content.split('\n');
  const inserts: { target: number; context: string }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const targets = new Set<number>();

    for (const m of line.matchAll(/\{\{link:(\d+)\|/g)) {
      const t = Number(m[1]);
      if (t !== noteId) targets.add(t);
    }

    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const t = titleMap.get(m[1].trim().toLowerCase());
      if (t && t !== noteId) targets.add(t);
    }

    if (!targets.size) continue;

    const context = line.slice(0, 300);
    for (const t of targets) {
      inserts.push({ target: t, context });
    }
  }

  for (const ins of inserts) {
    await env.DB.prepare(
      'INSERT INTO relations (source_note_id, target_note_id, context) VALUES (?, ?, ?)'
    ).bind(noteId, ins.target, ins.context).run();
  }
}

async function buildTitleMap(env: any): Promise<Map<string, number>> {
  const result: any = await env.DB.prepare('SELECT id, title FROM notes').all();
  const rows: Array<{ id: number; title: string }> = result.results || [];
  const map = new Map<string, number>();
  rows.forEach((n) => map.set(n.title.trim().toLowerCase(), n.id));
  return map;
}

// ============ Folders ============

app.get('/api/folders', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, position FROM folders ORDER BY position ASC, id ASC'
  ).all();
  return c.json(results);
});

app.post('/api/folders', requireAuth, async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: 'Name is required' }, 400);

  const result = await c.env.DB.prepare(
    'INSERT INTO folders (name) VALUES (?)'
  ).bind(name).run();

  return c.json({ id: result.meta.last_row_id, name }, 201);
});

app.put('/api/folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string }>();
  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

  await c.env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?')
    .bind(body.name.trim(), id).run();
  return c.json({ success: true });
});

app.delete('/api/folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?')
    .bind(id).run();
  await c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ============ Notes ============

app.get('/api/notes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, folder_id, updated_at FROM notes ORDER BY updated_at DESC'
  ).all();
  return c.json(results);
});

app.get('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?')
    .bind(id).first<{ id: number; title: string; content: string; folder_id: number | null }>();
  if (!note) return c.json({ error: 'Note not found' }, 404);

  const { results: backlinks } = await c.env.DB.prepare(`
    SELECT r.id, r.context, r.source_note_id, n.title AS source_title
    FROM relations r
    JOIN notes n ON n.id = r.source_note_id
    WHERE r.target_note_id = ?
    ORDER BY n.title ASC, r.id ASC
  `).bind(id).all();

  return c.json({ ...note, backlinks });
});

app.post('/api/notes', requireAuth, async (c) => {
  const body = await c.req.json<{ title?: string; content?: string; folder_id?: number | null }>();
  const title = body.title?.trim();
  if (!title) return c.json({ error: 'Title is required' }, 400);
  const folderId = typeof body.folder_id === 'number' ? body.folder_id : null;
  const content = body.content ?? '';

  const result = await c.env.DB.prepare(
    'INSERT INTO notes (title, content, folder_id) VALUES (?, ?, ?)'
  ).bind(title, content, folderId).run();

  const newId = Number(result.meta.last_row_id);
  const titleMap = await buildTitleMap(c.env);
  await rebuildRelations(c.env, newId, content, titleMap);

  return c.json({ id: newId, title, content, folder_id: folderId }, 201);
});

app.put('/api/notes/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ title?: string; content?: string; folder_id?: number | null }>();
  if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);

  const folderId = (body.folder_id === null || body.folder_id === undefined)
    ? null
    : Number(body.folder_id);
  const content = body.content ?? '';

  await c.env.DB.prepare(
    'UPDATE notes SET title = ?, content = ?, folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(body.title, content, folderId, id).run();

  const titleMap = await buildTitleMap(c.env);
  await rebuildRelations(c.env, id, content, titleMap);

  return c.json({ success: true });
});

app.delete('/api/notes/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM relations WHERE source_note_id = ? OR target_note_id = ?')
    .bind(id, id).run();
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ============ Graph ============

app.get('/api/graph', async (c) => {
  const notesResult: any = await c.env.DB.prepare('SELECT id, title FROM notes').all();
  const notes: Array<{ id: number; title: string }> = notesResult.results || [];

  const relResult: any = await c.env.DB.prepare(
    'SELECT source_note_id, target_note_id FROM relations'
  ).all();
  const relations: Array<{ source_note_id: number; target_note_id: number }> = relResult.results || [];

  const linksMap = new Map<number, Set<number>>();
  notes.forEach(n => linksMap.set(n.id, new Set()));
  relations.forEach(r => {
    if (linksMap.has(r.source_note_id)) {
      linksMap.get(r.source_note_id)!.add(r.target_note_id);
    }
  });

  const graph = notes.map(n => ({
    id: n.id,
    title: n.title,
    links: Array.from(linksMap.get(n.id) || []),
  }));

  return c.json(graph);
});

// ============ Images ============

app.get('/api/images', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, filename, title, size, content_type, created_at FROM images ORDER BY created_at DESC'
  ).all();
  return c.json(results);
});

app.get('/api/images/:id/file', async (c) => {
  const id = c.req.param('id');
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?')
    .bind(id).first<{ key: string; content_type: string | null }>();
  if (!image) return c.json({ error: 'Image not found' }, 404);

  const data = await c.env.IMAGES_KV.get(image.key, 'arrayBuffer');
  if (!data) return c.json({ error: 'File missing in KV' }, 404);

  return new Response(data, {
    headers: {
      'Content-Type': image.content_type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

app.post('/api/images', requireAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');
  const title = (formData.get('title') as string | null)?.trim() ?? '';

  if (!(file instanceof File)) return c.json({ error: 'Field "file" is required' }, 400);
  if (!file.type.startsWith('image/')) return c.json({ error: 'Only images allowed' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'Max 10 MB' }, 400);

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `img/${crypto.randomUUID()}.${ext}`;

  await c.env.IMAGES_KV.put(key, await file.arrayBuffer(), {
    metadata: { contentType: file.type },
  });

  const result = await c.env.DB.prepare(
    'INSERT INTO images (key, filename, title, size, content_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(key, file.name, title, file.size, file.type).run();

  return c.json({ id: result.meta.last_row_id, key, filename: file.name, title }, 201);
});

app.put('/api/images/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ title?: string }>();
  await c.env.DB.prepare('UPDATE images SET title = ? WHERE id = ?')
    .bind((body.title ?? '').trim(), id).run();
  return c.json({ success: true });
});

app.delete('/api/images/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const image = await c.env.DB.prepare('SELECT key FROM images WHERE id = ?')
    .bind(id).first<{ key: string }>();
  if (!image) return c.json({ error: 'Not found' }, 404);

  await c.env.IMAGES_KV.delete(image.key);
  await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ============ Videos ============

app.get('/api/videos', async (c) => {
  const type = c.req.query('type');
  let query = 'SELECT * FROM videos';
  const params: string[] = [];
  if (type === 'mine' || type === 'featured') {
    query += ' WHERE type = ?';
    params.push(type);
  }
  query += ' ORDER BY created_at ASC';
  const stmt = params.length
    ? c.env.DB.prepare(query).bind(...params)
    : c.env.DB.prepare(query);
  const { results } = await stmt.all();
  return c.json(results);
});

app.post('/api/videos', requireAuth, async (c) => {
  const body = await c.req.json<{ url?: string; type?: string; title?: string }>();
  const url = body.url?.trim();
  const type = body.type === 'featured' ? 'featured' : 'mine';
  if (!url) return c.json({ error: 'url is required' }, 400);
  if (!extractVideoId(url)) return c.json({ error: 'Not a valid YouTube URL' }, 400);

  const meta = await fetchYouTubeMeta(url);
  const manualTitle = (body.title ?? '').trim();
  const title = manualTitle || meta?.title || '';

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO videos (url, title, author, thumbnail, type) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      url,
      title,
      meta?.author ?? '',
      meta?.thumbnail ?? '',
      type
    ).run();

    return c.json({ id: result.meta.last_row_id, url, title, type }, 201);
  } catch (e: any) {
    if (String(e).includes('UNIQUE')) {
      return c.json({ error: 'Это видео уже добавлено' }, 409);
    }
    throw e;
  }
});

app.put('/api/videos/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ url?: string; title?: string; type?: string }>();

  const updates: string[] = [];
  const values: any[] = [];

  if (typeof body.url === 'string' && body.url.trim()) {
    const newUrl = body.url.trim();
    if (!extractVideoId(newUrl)) {
      return c.json({ error: 'Not a valid YouTube URL' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM videos WHERE url = ? AND id != ?'
    ).bind(newUrl, id).first();
    if (existing) {
      return c.json({ error: 'Это видео уже есть в списке' }, 409);
    }

    const meta = await fetchYouTubeMeta(newUrl);
    updates.push('url = ?', 'author = ?', 'thumbnail = ?');
    values.push(newUrl, meta?.author ?? '', meta?.thumbnail ?? '');
  }

  if (typeof body.title === 'string') {
    updates.push('title = ?');
    values.push(body.title.trim());
  }
  if (body.type === 'mine' || body.type === 'featured') {
    updates.push('type = ?');
    values.push(body.type);
  }

  if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);

  values.push(id);
  await c.env.DB.prepare(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();
  return c.json({ success: true });
});

app.delete('/api/videos/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default app;