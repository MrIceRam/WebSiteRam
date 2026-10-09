export function renderPhotos(root) {
  root.innerHTML = `
    <section class="page photos-page">
      <div class="page-header">
        <h1>🖼️ Фото</h1>
        <div class="page-actions">
          <input type="file" id="file-input" accept="image/*" hidden>
          <button id="upload-btn" class="primary">+ Загрузить</button>
        </div>
      </div>
      <p class="dim" style="margin-bottom:16px">
        Клик по картинке — скопировать Markdown-ссылку для вставки в закладку.
      </p>
      <div id="photos-grid" class="photos-grid">
        <p class="dim">Загрузка…</p>
      </div>
    </section>
  `;

  const grid      = root.querySelector('#photos-grid');
  const fileInput = root.querySelector('#file-input');
  const uploadBtn = root.querySelector('#upload-btn');

  function getPassword() { return sessionStorage.getItem('password') || ''; }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  async function loadImages() {
    try {
      const res = await fetch('/api/images');
      const images = await res.json();
      if (!images.length) {
        grid.innerHTML = '<p class="dim">Пока нет картинок. Нажми «+ Загрузить».</p>';
        return;
      }
      grid.innerHTML = images.map(img => {
        const name = (img.title || '').trim() || img.filename;
        return `
          <div class="photo-card" data-id="${img.id}">
            <img src="/api/images/${img.id}/file" alt="${escapeAttr(name)}" loading="lazy">
            <div class="photo-meta">
              <span class="photo-name" title="${escapeAttr(name)}">${escapeHtml(name)}</span>
              <button class="photo-rename" title="Переименовать">✎</button>
              <button class="photo-delete" title="Удалить">✕</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      grid.innerHTML = `<p class="dim">Ошибка: ${e.message}</p>`;
    }
  }

  uploadBtn.addEventListener('click', () => {
    if (!getPassword()) { alert('Сначала разблокируй доступ в «Закладках»'); return; }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);

    try {
      uploadBtn.textContent = '⏳ Загрузка…';
      uploadBtn.disabled = true;

      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getPassword()}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      fileInput.value = '';
      await loadImages();
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message);
    } finally {
      uploadBtn.textContent = '+ Загрузить';
      uploadBtn.disabled = false;
    }
  });

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.photo-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.classList.contains('photo-delete')) {
      if (!getPassword()) { alert('Нужен пароль'); return; }
      if (!confirm('Удалить картинку?')) return;
      try {
        const res = await fetch(`/api/images/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${getPassword()}` },
        });
        if (!res.ok) throw new Error('Delete failed');
        await loadImages();
      } catch (err) { alert(err.message); }
      return;
    }

    if (e.target.classList.contains('photo-rename')) {
      if (!getPassword()) { alert('Нужен пароль'); return; }
      const nameEl = card.querySelector('.photo-name');
      const old = nameEl.textContent;
      const newTitle = prompt('Новое название:', old);
      if (newTitle === null) return;
      try {
        await fetch(`/api/images/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getPassword()}`,
          },
          body: JSON.stringify({ title: newTitle }),
        });
        await loadImages();
      } catch (err) { alert(err.message); }
      return;
    }

    const img = card.querySelector('img');
    const url = `${location.origin}/api/images/${id}/file`;
    const md = `![${img.alt || 'image'}](${url})`;
    try {
      await navigator.clipboard.writeText(md);
      const name = card.querySelector('.photo-name');
      const old = name.textContent;
      name.textContent = '✓ Скопировано';
      name.style.color = 'var(--accent)';
      setTimeout(() => {
        name.textContent = old;
        name.style.color = '';
      }, 1500);
    } catch {
      prompt('Скопируй вручную:', md);
    }
  });

  loadImages();
}