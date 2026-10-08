import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============ Публичные роуты ============

// Список всех заметок (только id, title, дата)
app.get('/api/notes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC'
  ).all();
  return c.json(results);
});

// Одна заметка
app.get('/api/notes/:id', async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?')
    .bind(id)
    .first();
  if (!note) return c.json({ error: 'Note not found' }, 404);
  return c.json(note);
});

// ============ Проверка пароля (middleware) ============

const requireAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const password = authHeader?.replace('Bearer ', '');

  if (!password || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// ============ Защищённые роуты ============

// Создать
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

// Обновить
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

// Удалить
app.delete('/api/notes/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default app;