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

  // ↓↓↓ СЮДА ВСТАВЬ ВЕСЬ СТАРЫЙ КОД ИЗ app.js ↓↓↓
  // Переменные: notes, currentNote, password, editingId
  // DOM: notesList, viewer, editor, editorTitle, editorContent, searchInput, authBtn
  // Функции: authHeaders, api, renderMarkdown, renderList, escapeHtml, openNote,
  //          attachWikiLinks, loadNotes, openEditor, saveNote, deleteNote,
  //          updateAuthButton, обработчики событий
  //
  // В конце — стартовые вызовы:
  // updateAuthButton();
  // loadNotes().catch(err => {
  //   viewer.innerHTML = `<p class="placeholder">Ошибка: ${err.message}</p>`;
  // });
}