export function renderPhotos(root) {
  root.innerHTML = `
    <section class="page photos-page">
      <div class="page-header">
        <h1>🖼️ Фото</h1>
      </div>
      <p class="dim" style="margin-bottom:16px">
        Клик по картинке — скопировать Markdown-ссылку для вставки в закладку.
      </p>
      <div id="photos-grid" class="photos-grid">
        <p class="dim">Загрузка…</p>
      </div>
    </section>
  `;

  const grid = root.querySelector('#photos-grid');

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  async function loadImages() {
    try {
      const res = await fetch('/data/images.json');
      if (!res.ok) throw new Error('Не удалось загрузить /data/images.json');
      const images = await res.json();

      if (!images.length) {
        grid.innerHTML = '<p class="dim">Пока нет картинок.</p>';
        return;
      }

      grid.innerHTML = images.map(img => {
        // Приоритет: title → имя файла без расширения
        const displayName = (img.title || '').trim()
          || img.filename.replace(/\.[^.]+$/, '');

        return `
          <div class="photo-card">
            <img src="${escapeAttr(img.file)}"
                 alt="${escapeAttr(displayName)}"
                 loading="lazy">
            <div class="photo-meta">
              <span class="photo-name" title="${escapeAttr(displayName)}">${escapeHtml(displayName)}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      grid.innerHTML = `<p class="dim">Ошибка: ${e.message}</p>`;
    }
  }

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.photo-card');
    if (!card) return;
    const img = card.querySelector('img');
    const url = new URL(img.src, location.origin).href;
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