export function renderBookmarks(root) {
  root.innerHTML = `
    <div class="bookmarks-page">
      <div class="bookmarks-tabs">
        <button class="bookmarks-tab active" data-tab="notes">📝 Заметки</button>
        <button class="bookmarks-tab" data-tab="graph">🕸 Граф связей</button>
      </div>

      <div class="bookmarks-tab-content" id="tab-notes">
        <div class="notes-layout">
          <aside class="sidebar">
            <div class="sidebar-header">
              <h1>🔖 Заметки</h1>
              <button id="new-note-btn" title="Новая">+</button>
            </div>

            <div class="folders-panel">
              <div class="folders-panel-header">
                <span>📁 Папки</span>
                <button id="new-folder-btn" title="Новая папка">+</button>
              </div>
              <ul id="folders-list"></ul>
            </div>

            <input id="search" type="text" placeholder="Поиск...">
            <ul id="notes-list"></ul>
            <div class="sidebar-footer">
              <button id="auth-btn">🔓 Разблокировать</button>
            </div>
          </aside>
          <main class="content">
            <div id="viewer" class="viewer">
              <div class="placeholder-box">
                <p class="placeholder">Выбери запись слева или создай новую</p>
                <div class="help-box">
                  <h3>💡 Как связать текст с заметкой</h3>
                  <p><b>Способ 1 (удобный):</b> в редакторе выдели слово (например «Влад») → нажми <b>🔗 Связать</b> → выбери или создай заметку. Готово — теперь клик по «Влад» открывает ту заметку, даже если Владов несколько.</p>
                  <p><b>Способ 2 (быстрый):</b> напиши <code>[[Название заметки]]</code> — это ссылка по имени. Работает, но если заметок с таким именем несколько, откроется первая.</p>
                  <p>На заметке, на которую ссылаются, появится блок <b>«🔗 Обратные ссылки»</b> со списком всех, кто на неё ссылается — как в Obsidian.</p>
                </div>
              </div>
            </div>
            <div id="editor" class="editor hidden">
              <input id="editor-title" type="text" placeholder="Заголовок">
              <div class="editor-toolbar">
                <button id="link-btn" type="button" title="Превратить выделенный текст в ссылку на заметку">🔗 Связать</button>
                <label class="folder-select-label">
                  📁
                  <select id="editor-folder">
                    <option value="">Без папки</option>
                  </select>
                </label>
              </div>
              <textarea id="editor-content" placeholder="Текст (Markdown). Выдели слово и нажми «🔗 Связать» — превратится в ссылку на заметку."></textarea>
              <div class="editor-actions">
                <button id="save-btn" class="primary">💾 Сохранить</button>
                <button id="cancel-btn">Отмена</button>
                <button id="delete-btn" class="danger">🗑 Удалить</button>
              </div>
            </div>
          </main>
        </div>
      </div>

      <div class="bookmarks-tab-content hidden" id="tab-graph">
        <div class="graph-wrap">
          <div class="graph-toolbar">
            <span class="dim">Тяни узлы · колесо — зум · клик по узлу — открыть заметку</span>
          </div>
          <div id="graph-container"></div>
        </div>
      </div>

      <!-- Модалка выбора заметки для ссылки -->
      <div class="modal-overlay hidden" id="link-modal">
        <div class="modal">
          <div class="modal-header">
            <h3>Связать «<span id="link-modal-text"></span>» с заметкой</h3>
            <button class="modal-close" type="button">✕</button>
          </div>
          <input type="text" id="link-modal-search" placeholder="Поиск заметки...">
          <ul id="link-modal-list"></ul>
          <div class="modal-footer">
            <button id="link-modal-create" class="primary" type="button">+ Создать новую</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let notes = [];
  let folders = [];
  let graphData = [];
  let currentNote = null;
  let password = sessionStorage.getItem('password') || '';
  let editingId = null;
  let activeFolder = 'all';
  let network = null;

  const notesList      = root.querySelector('#notes-list');
  const foldersList    = root.querySelector('#folders-list');
  const viewer         = root.querySelector('#viewer');
  const editor         = root.querySelector('#editor');
  const editorTitle    = root.querySelector('#editor-title');
  const editorContent  = root.querySelector('#editor-content');
  const editorFolder   = root.querySelector('#editor-folder');
  const searchInput    = root.querySelector('#search');
  const authBtn        = root.querySelector('#auth-btn');
  const tabNotes       = root.querySelector('#tab-notes');
  const tabGraph       = root.querySelector('#tab-graph');
  const graphContainer = root.querySelector('#graph-container');

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

    // Новый формат {{link:ID|текст}}
    html = html.replace(/\{\{link:(\d+)\|([^}]+)\}\}/g, (_, id, txt) => {
      const note = notes.find(n => n.id === Number(id));
      if (note) {
        return `<a href="#" class="wiki-link" data-id="${id}">${escapeHtml(txt)}</a>`;
      }
      return `<a href="#" class="wiki-link missing" data-id="${id}">${escapeHtml(txt)}</a>`;
    });

    // Старый формат [[Заголовок]]
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
      const trimmed = title.trim();
      const target = notes.find(n => n.title.toLowerCase() === trimmed.toLowerCase());
      if (target) {
        return `<a href="#" class="wiki-link" data-id="${target.id}">${escapeHtml(trimmed)}</a>`;
      }
      return `<a href="#" class="wiki-link missing" data-title="${escapeHtml(trimmed)}">${escapeHtml(trimmed)}</a>`;
    });

    html = html.split(/\n\n+/).map(p => {
      if (p.startsWith('<')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }

  function renderFolders() {
    const items = [{ id: 'all', name: 'Все заметки', count: notes.length }];
    folders.forEach(f => {
      items.push({
        id: f.id,
        name: f.name,
        count: notes.filter(n => n.folder_id === f.id).length,
      });
    });
    if (folders.length) {
      items.push({
        id: 'none',
        name: 'Без папки',
        count: notes.filter(n => !n.folder_id).length,
      });
    }

    foldersList.innerHTML = items.map(it => `
      <li data-folder="${it.id}" class="${String(activeFolder) === String(it.id) ? 'active' : ''}">
        <span class="folder-name">${escapeHtml(it.name)}</span>
        <span class="folder-count">${it.count}</span>
        ${typeof it.id === 'number' ? `
          <span class="folder-actions">
            <button class="folder-rename" title="Переименовать" data-id="${it.id}">✎</button>
            <button class="folder-delete" title="Удалить" data-id="${it.id}">✕</button>
          </span>
        ` : ''}
      </li>
    `).join('');
  }

  function renderList() {
    const q = searchInput.value.toLowerCase();

    let filtered = notes;
    if (activeFolder !== 'all') {
      if (activeFolder === 'none') {
        filtered = filtered.filter(n => !n.folder_id);
      } else {
        filtered = filtered.filter(n => n.folder_id === Number(activeFolder));
      }
    }
    filtered = filtered.filter(n => n.title.toLowerCase().includes(q));

    notesList.innerHTML = filtered.map(n => `
      <li data-id="${n.id}" class="${currentNote?.id == n.id ? 'active' : ''}">${escapeHtml(n.title)}</li>
    `).join('');
  }

    async function openNote(id) {
    const note = await api(`/notes/${id}`);
    currentNote = note;
    viewer.classList.remove('hidden');
    editor.classList.add('hidden');

    // note.backlinks — массив { id, context, source_note_id, source_title }
    const backlinks = note.backlinks || [];
    const folder = note.folder_id ? folders.find(f => f.id === note.folder_id) : null;

    // Группируем обратные ссылки по заметке-источнику
    const grouped = new Map();
    backlinks.forEach(b => {
      if (!grouped.has(b.source_note_id)) {
        grouped.set(b.source_note_id, { title: b.source_title, items: [] });
      }
      grouped.get(b.source_note_id).items.push(b);
    });

    const backlinksHtml = backlinks.length ? `
      <div class="backlinks">
        <h3>🔗 Обратные ссылки (${backlinks.length})</h3>
        ${Array.from(grouped.entries()).map(([srcId, group]) => `
          <div class="backlink-group">
            <div class="backlink-source">
              <a href="#" class="backlink-title" data-id="${srcId}">${escapeHtml(group.title)}</a>
            </div>
            <ul class="backlink-contexts">
              ${group.items.map(b => `
                <li>${renderMarkdownInline(b.context)}</li>
              `).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    ` : '';

    viewer.innerHTML = `
      <div class="viewer-header">
        <div>
          <h1>${escapeHtml(note.title)}</h1>
          ${folder ? `<span class="note-folder-badge">📁 ${escapeHtml(folder.name)}</span>` : ''}
        </div>
        <div class="viewer-actions">
          <button class="btn-edit" title="Редактировать">✏ Редактировать</button>
          <button class="btn-delete-note danger" title="Удалить">🗑</button>
        </div>
      </div>
      <div class="body">${renderMarkdown(note.content)}</div>
      ${backlinksHtml}
    `;

    viewer.querySelector('.btn-edit').addEventListener('click', () => openEditor(note));

    viewer.querySelector('.btn-delete-note').addEventListener('click', async () => {
      if (!password) { alert('Сначала нажми 🔓 Разблокировать'); return; }
      if (!confirm(`Удалить заметку "${note.title}"?`)) return;
      try {
        await api(`/notes/${note.id}`, { method: 'DELETE' });
        currentNote = null;
        viewer.innerHTML = '<p class="placeholder">Заметка удалена</p>';
        await loadNotes();
        await loadGraphData();
      } catch (err) { alert(err.message); }
    });

    viewer.querySelectorAll('.backlink-title').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openNote(a.dataset.id);
      });
    });

    viewer.querySelectorAll('.wiki-link').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (a.dataset.id) {
          openNote(a.dataset.id);
        } else if (a.classList.contains('missing')) {
          const title = a.dataset.title;
          if (!password) {
            alert(`Заметки "${title}" нет. Разблокируй доступ, чтобы её создать.`);
            return;
          }
          if (!confirm(`Заметки "${title}" нет. Создать?`)) return;
          try {
            const created = await api('/notes', {
              method: 'POST',
              body: JSON.stringify({ title, content: '' }),
            });
            await loadNotes();
            await loadGraphData();
            await openNote(created.id);
            openEditor({ id: created.id, title, content: '', folder_id: null });
          } catch (err) { alert(err.message); }
        }
      });
    });

    renderList();
  }

  // Рендер markdown внутри backlinks-context: без <p>-обёрток, только ссылки и код
  function renderMarkdownInline(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/\{\{link:(\d+)\|([^}]+)\}\}/g, (_, id, txt) => {
      const note = notes.find(n => n.id === Number(id));
      const cls = note ? 'wiki-link' : 'wiki-link missing';
      return `<a href="#" class="${cls}" data-id="${id}">${escapeHtml(txt)}</a>`;
    });

    html = html.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
      const trimmed = title.trim();
      const target = notes.find(n => n.title.toLowerCase() === trimmed.toLowerCase());
      if (target) {
        return `<a href="#" class="wiki-link" data-id="${target.id}">${escapeHtml(trimmed)}</a>`;
      }
      return `<a href="#" class="wiki-link missing" data-title="${escapeHtml(trimmed)}">${escapeHtml(trimmed)}</a>`;
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    return html;
  }

  async function loadNotes() {
    notes = await api('/notes');
    renderFolders();
    renderList();
  }

  async function loadFolders() {
    folders = await api('/folders');
    renderFolders();
  }

  async function loadGraphData() {
    try {
      graphData = await api('/graph');
    } catch (e) {
      graphData = [];
    }
  }

  function refreshFolderSelect(selectedId) {
    editorFolder.innerHTML = '<option value="">Без папки</option>' +
      folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
    editorFolder.value = selectedId ? String(selectedId) : '';
  }

  function openEditor(note = null) {
    if (!password) { alert('Сначала нажми 🔓 Разблокировать'); return; }
    editingId = note?.id ?? null;
    editorTitle.value = note?.title ?? '';
    editorContent.value = note?.content ?? '';

    let folderId = '';
    if (note) {
      folderId = note.folder_id ?? '';
    } else if (typeof activeFolder === 'number') {
      folderId = String(activeFolder);
    }
    refreshFolderSelect(folderId);

    viewer.classList.add('hidden');
    editor.classList.remove('hidden');
    editorTitle.focus();
  }

  async function saveNote() {
    const title = editorTitle.value.trim();
    const content = editorContent.value;
    if (!title) { alert('Введите заголовок'); return; }

    const folderId = editorFolder.value ? Number(editorFolder.value) : null;

    try {
      if (editingId) {
        await api(`/notes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ title, content, folder_id: folderId }),
        });
        await loadNotes();
        await loadGraphData();
        await openNote(editingId);
      } else {
        const created = await api('/notes', {
          method: 'POST',
          body: JSON.stringify({ title, content, folder_id: folderId }),
        });
        await loadNotes();
        await loadGraphData();
        await openNote(created.id);
      }
    } catch (e) { alert(e.message); }
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

  // ==== Папки: клики ====

  foldersList.addEventListener('click', async (e) => {
    const li = e.target.closest('li');
    if (!li) return;

    // Удалить
    if (e.target.classList.contains('folder-delete')) {
      e.stopPropagation();
      if (!password) { alert('Нужен пароль'); return; }
      const id = e.target.dataset.id;
      const f = folders.find(x => String(x.id) === String(id));
      if (!confirm(`Удалить папку "${f?.name}"? Заметки останутся, но будут без папки.`)) return;
      try {
        await api(`/folders/${id}`, { method: 'DELETE' });
        if (String(activeFolder) === String(id)) activeFolder = 'all';
        await loadFolders();
        await loadNotes();
      } catch (err) { alert(err.message); }
      return;
    }

    // Переименовать
    if (e.target.classList.contains('folder-rename')) {
      e.stopPropagation();
      if (!password) { alert('Нужен пароль'); return; }
      const id = e.target.dataset.id;
      const f = folders.find(x => String(x.id) === String(id));
      const newName = prompt('Новое название папки:', f?.name || '');
      if (newName === null) return;
      if (!newName.trim()) return;
      try {
        await api(`/folders/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: newName.trim() }),
        });
        await loadFolders();
      } catch (err) { alert(err.message); }
      return;
    }

    // Выбрать папку
    const raw = li.dataset.folder;
    if (raw === 'all' || raw === 'none') {
      activeFolder = raw;
    } else {
      activeFolder = Number(raw);
    }
    renderFolders();
    renderList();
  });

  root.querySelector('#new-folder-btn').addEventListener('click', async () => {
    if (!password) { alert('Сначала нажми 🔓 Разблокировать'); return; }
    const name = prompt('Название папки:');
    if (!name || !name.trim()) return;
    try {
      await api('/folders', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadFolders();
    } catch (e) { alert(e.message); }
  });

  // ==== Список заметок ====

  notesList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) openNote(li.dataset.id);
  });

  searchInput.addEventListener('input', renderList);

  // ==== Кнопки редактора ====

  root.querySelector('#new-note-btn').addEventListener('click', () => openEditor());
  root.querySelector('#save-btn').addEventListener('click', saveNote);
  root.querySelector('#cancel-btn').addEventListener('click', () => {
    editor.classList.add('hidden');
    viewer.classList.remove('hidden');
    if (currentNote) openNote(currentNote.id);
  });
  root.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Удалить заметку?')) return;
    try {
      await api(`/notes/${editingId}`, { method: 'DELETE' });
      currentNote = null;
      editor.classList.add('hidden');
      viewer.classList.remove('hidden');
      viewer.innerHTML = '<p class="placeholder">Заметка удалена</p>';
      await loadNotes();
      await loadGraphData();
    } catch (e) { alert(e.message); }
  });

  // ==== Модалка выбора заметки ====

  const linkModal     = root.querySelector('#link-modal');
  const linkModalText = root.querySelector('#link-modal-text');
  const linkSearch    = root.querySelector('#link-modal-search');
  const linkList      = root.querySelector('#link-modal-list');
  const linkCreate    = root.querySelector('#link-modal-create');
  const linkClose     = root.querySelector('.modal-close');

  function openLinkPicker(selectedText, onPick) {
    linkModalText.textContent = selectedText;
    linkModal.classList.remove('hidden');
    linkSearch.value = '';
    renderLinkOptions('');
    setTimeout(() => linkSearch.focus(), 0);

    function close() {
      linkModal.classList.add('hidden');
      linkSearch.oninput = null;
      linkList.onclick = null;
      linkCreate.onclick = null;
      linkClose.onclick = null;
      linkModal.onclick = null;
    }

    function renderLinkOptions(q) {
      const query = q.toLowerCase();
      const filtered = notes.filter(n => n.title.toLowerCase().includes(query));
      if (!filtered.length) {
        linkList.innerHTML = '<li class="dim">Ничего не найдено</li>';
        return;
      }
      linkList.innerHTML = filtered.map(n => `
        <li data-id="${n.id}">
          <span class="link-note-title">${escapeHtml(n.title)}</span>
        </li>
      `).join('');
    }

    linkSearch.oninput = () => renderLinkOptions(linkSearch.value);

    linkList.onclick = (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = Number(li.dataset.id);
      const note = notes.find(n => n.id === id);
      if (!note) return;
      close();
      onPick(note);
    };

    linkCreate.onclick = async () => {
      try {
        const created = await api('/notes', {
          method: 'POST',
          body: JSON.stringify({ title: selectedText, content: '', folder_id: null }),
        });
        await loadNotes();
        await loadGraphData();
        close();
        onPick(created);
      } catch (err) { alert(err.message); }
    };

    linkClose.onclick = close;
    linkModal.onclick = (e) => { if (e.target === linkModal) close(); };
  }

  // Кнопка "🔗 Связать" — превращает выделенный текст в ссылку
  root.querySelector('#link-btn').addEventListener('click', () => {
    const start = editorContent.selectionStart;
    const end = editorContent.selectionEnd;
    const selected = editorContent.value.slice(start, end).trim();

    if (!selected) {
      alert('Сначала выдели в тексте слово или фразу, которую хочешь сделать ссылкой');
      editorContent.focus();
      return;
    }

    openLinkPicker(selected, (note) => {
      const replacement = `{{link:${note.id}|${selected}}}`;
      const before = editorContent.value.slice(0, start);
      const after = editorContent.value.slice(end);
      editorContent.value = before + replacement + after;
      const newPos = start + replacement.length;
      editorContent.focus();
      editorContent.setSelectionRange(newPos, newPos);
    });
  });

  // ==== Табы ====

  function switchTab(name) {
    root.querySelectorAll('.bookmarks-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    tabNotes.classList.toggle('hidden', name !== 'notes');
    tabGraph.classList.toggle('hidden', name !== 'graph');
    if (name === 'graph') {
      requestAnimationFrame(() => renderGraph());
    }
  }

  root.querySelectorAll('.bookmarks-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // ==== Граф ====

  function renderGraph() {
    if (!graphContainer) return;
    if (typeof vis === 'undefined') {
      graphContainer.innerHTML = '<p class="dim" style="padding:20px">Граф не загрузился — проверь интернет и обнови страницу.</p>';
      return;
    }
    if (!graphData.length) {
      graphContainer.innerHTML = '<p class="dim" style="padding:20px">Пока нет заметок — добавь пару и создай между ними связи.</p>';
      return;
    }

    const degree = {};
    graphData.forEach(n => {
      n.links.forEach(t => {
        degree[n.id] = (degree[n.id] || 0) + 1;
        degree[t] = (degree[t] || 0) + 1;
      });
    });

    const nodes = graphData.map(n => ({
      id: n.id,
      label: n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title,
      title: n.title,
      size: 12 + Math.min((degree[n.id] || 0) * 3, 28),
      color: {
        background: '#4a9eff',
        border: '#4a9eff',
        highlight: { background: '#6cb0ff', border: '#6cb0ff' },
      },
    }));

    const edges = [];
    const seen = new Set();
    graphData.forEach(n => {
      n.links.forEach(t => {
        const k = `${n.id}-${t}`;
        if (!seen.has(k)) {
          seen.add(k);
          edges.push({ from: n.id, to: t, arrows: 'to' });
        }
      });
    });

    const data = {
      nodes: new vis.DataSet(nodes),
      edges: new vis.DataSet(edges),
    };

    const options = {
      nodes: {
        shape: 'dot',
        font: { color: '#d4d4d4', size: 14, face: 'system-ui, sans-serif' },
        borderWidth: 2,
      },
      edges: {
        color: { color: '#555', highlight: '#4a9eff', hover: '#4a9eff' },
        width: 1.2,
        smooth: { type: 'continuous' },
      },
      physics: {
        enabled: true,
        stabilization: { iterations: 150 },
        barnesHut: {
          gravitationalConstant: -8000,
          springLength: 130,
          springConstant: 0.04,
          damping: 0.09,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        navigationButtons: false,
      },
    };

    if (network) network.destroy();
    network = new vis.Network(graphContainer, data, options);

    network.on('click', (params) => {
      if (params.nodes.length === 1) {
        switchTab('notes');
        openNote(params.nodes[0]);
      }
    });
  }

  updateAuthButton();
  Promise.all([loadFolders(), loadNotes(), loadGraphData()]).catch(err => {
    viewer.innerHTML = `<p class="placeholder">Ошибка: ${err.message}</p>`;
  });
}