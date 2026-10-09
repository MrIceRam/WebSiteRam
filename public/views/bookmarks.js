export function renderBookmarks(root) {
  root.innerHTML = `
    <div class="notes-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>🔖 Закладки</h1>
          <button id="new-note-btn" title="Новая">+</button>
        </div>
        <input id="search" type="text" placeholder="Поиск...">
        <ul id="notes-list"></ul>
        <div class="sidebar-footer">
          <button id="auth-btn">🔓 Разблокировать</button>
        </div>
      </aside>
      <main class="content">
        <div id="viewer" class="viewer">
          <p class="placeholder">Выбери запись слева</p>
        </div>
        <div id="editor" class="editor hidden">
          <input id="editor-title" type="text" placeholder="Заголовок">
          <textarea id="editor-content" placeholder="Текст (Markdown)"></textarea>
          <div class="editor-actions">
            <button id="save-btn" class="primary">Сохранить</button>
            <button id="cancel-btn">Отмена</button>
            <button id="delete-btn" class="danger">Удалить</button>
          </div>
        </div>
      </main>
    </div>
  `;

  let notes = [];
  let currentNote = null;
  let password = sessionStorage.getItem('password') || '';
  let editingId = null;

  const notesList     = root.querySelector('#notes-list');
  const viewer        = root.querySelector('#viewer');
  const editor        = root.querySelector('#editor');
  const editorTitle   = root.querySelector('#editor-title');
  const editorContent = root.querySelector('#editor-content');
  const searchInput   = root.querySelector('#search');
  const authBtn       = root.querySelector('#auth-btn');

  function authHeaders() {
    return password ? { 'Authorization': `Bearer ${password}` } : {};
  }

  async function api(path, options = {}) {
    const res = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<a href="#" class="wiki-link" data-title="$1">$1</a>');

    html = html.split(/\n\n+/).map(p => {
      if (p.startsWith('<')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }

  function renderList() {
    const q = searchInput.value.toLowerCase();
    const filtered = notes.filter(n => n.title.toLowerCase().includes(q));
    notesList.innerHTML = filtered.map(n => `
      <li data-id="${n.id}" class="${currentNote?.id == n.id ? 'active' : ''}">${escapeHtml(n.title)}</li>
    `).join('');
  }

  function attachWikiLinks() {
    viewer.querySelectorAll('.wiki-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const title = link.dataset.title.toLowerCase();
        const target = notes.find(n => n.title.toLowerCase() === title);
        if (target) openNote(target.id);
        else alert(`Заметка "${link.dataset.title}" не найдена`);
      });
    });
  }

  async function openNote(id) {
    const note = await api(`/notes/${id}`);
    currentNote = note;
    viewer.classList.remove('hidden');
    editor.classList.add('hidden');
    viewer.innerHTML = `
      <h1>${escapeHtml(note.title)}</h1>
      <div class="body">${renderMarkdown(note.content)}</div>
    `;
    renderList();
    attachWikiLinks();
  }

  async function loadNotes() {
    notes = await api('/notes');
    renderList();
  }

  function openEditor(note = null) {
    if (!password) { alert('Сначала нажми 🔓 Разблокировать'); return; }
    editingId = note?.id ?? null;
    editorTitle.value = note?.title ?? '';
    editorContent.value = note?.content ?? '';
    viewer.classList.add('hidden');
    editor.classList.remove('hidden');
    editorTitle.focus();
  }

  async function saveNote() {
    const title = editorTitle.value.trim();
    const content = editorContent.value;
    if (!title) { alert('Введите заголовок'); return; }

    if (editingId) {
      await api(`/notes/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content }),
      });
      await loadNotes();
      await openNote(editingId);
    } else {
      const created = await api('/notes', {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });
      await loadNotes();
      await openNote(created.id);
    }
  }

  async function deleteNote() {
    if (!editingId) return;
    if (!confirm('Удалить заметку?')) return;
    await api(`/notes/${editingId}`, { method: 'DELETE' });
    currentNote = null;
    editor.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '<p class="placeholder">Заметка удалена</p>';
    await loadNotes();
  }

  function updateAuthButton() {
    if (password) {
      authBtn.textContent = '🔒 Заблокировать';
      authBtn.classList.add('unlocked');
    } else {
      authBtn.textContent = '🔓 Разблокировать';
      authBtn.classList.remove('unlocked');
    }
  }

  authBtn.addEventListener('click', () => {
    if (password) {
      password = '';
      sessionStorage.removeItem('password');
    } else {
      const p = prompt('Введите пароль:');
      if (!p) return;
      password = p;
      sessionStorage.setItem('password', p);
    }
    updateAuthButton();
  });

  notesList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) openNote(li.dataset.id);
  });

  searchInput.addEventListener('input', renderList);

  root.querySelector('#new-note-btn').addEventListener('click', () => openEditor());
  root.querySelector('#save-btn').addEventListener('click', saveNote);
  root.querySelector('#delete-btn').addEventListener('click', deleteNote);
  root.querySelector('#cancel-btn').addEventListener('click', () => {
    editor.classList.add('hidden');
    viewer.classList.remove('hidden');
    if (currentNote) openNote(currentNote.id);
  });

  viewer.addEventListener('click', (e) => {
    if (e.target.tagName === 'H1' && currentNote) {
      openEditor(currentNote);
    }
  });

  updateAuthButton();
  loadNotes().catch(err => {
    viewer.innerHTML = `<p class="placeholder">Ошибка: ${err.message}</p>`;
  });
}