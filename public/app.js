const API = '/api';

let notes = [];
let currentNote = null;
let password = sessionStorage.getItem('password') || '';
let editingId = null;

// ==== DOM ====
const notesList = document.getElementById('notes-list');
const viewer = document.getElementById('viewer');
const editor = document.getElementById('editor');
const editorTitle = document.getElementById('editor-title');
const editorContent = document.getElementById('editor-content');
const searchInput = document.getElementById('search');
const authBtn = document.getElementById('auth-btn');

// ==== Утилиты ====

function authHeaders() {
  return password ? { 'Authorization': `Bearer ${password}` } : {};
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
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

// Простой рендер Markdown (без внешних библиотек, минимум)
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // код-блоки
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
  // inline-код
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // жирный, курсив
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // заголовки
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // цитаты
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // ссылки
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // wiki-ссылки [[Название]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<a href="#" class="wiki-link" data-title="$1">$1</a>');
  // абзацы
  html = html.split(/\n\n+/).map(p => {
    if (p.startsWith('<')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

// ==== Рендер списка ====

function renderList() {
  const q = searchInput.value.toLowerCase();
  const filtered = notes.filter(n => n.title.toLowerCase().includes(q));
  notesList.innerHTML = filtered.map(n => `
    <li data-id="${n.id}" class="${currentNote?.id == n.id ? 'active' : ''}">${escapeHtml(n.title)}</li>
  `).join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ==== Показать заметку ====

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

function attachWikiLinks() {
  document.querySelectorAll('.wiki-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const title = link.dataset.title.toLowerCase();
      const target = notes.find(n => n.title.toLowerCase() === title);
      if (target) openNote(target.id);
      else alert(`Заметка "${link.dataset.title}" не найдена`);
    });
  });
}

// ==== Загрузка списка ====

async function loadNotes() {
  notes = await api('/notes');
  renderList();
}

// ==== Редактор ====

function openEditor(note = null) {
  if (!password) { alert('Введите пароль для редактирования'); return; }
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

// ==== Пароль ====

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

// ==== Обработчики событий ====

notesList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) openNote(li.dataset.id);
});

searchInput.addEventListener('input', renderList);

document.getElementById('new-note-btn').addEventListener('click', () => openEditor());
document.getElementById('save-btn').addEventListener('click', saveNote);
document.getElementById('delete-btn').addEventListener('click', deleteNote);
document.getElementById('cancel-btn').addEventListener('click', () => {
  editor.classList.add('hidden');
  viewer.classList.remove('hidden');
  if (currentNote) openNote(currentNote.id);
});

// Клик по заголовку в режиме просмотра — открыть редактор
viewer.addEventListener('click', (e) => {
  if (e.target.tagName === 'H1' && currentNote) {
    openEditor(currentNote);
  }
});

// ==== Старт ====

updateAuthButton();
loadNotes().catch(err => {
  viewer.innerHTML = `<p class="placeholder">Ошибка загрузки: ${err.message}</p>`;
});