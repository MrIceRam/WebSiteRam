const SOCIALS = [
  { key: 'youtube',  name: 'YouTube',  icon: '▶',  url: 'https://www.youtube.com/@MrIceRam' },
  { key: 'twitch',   name: 'Twitch',   icon: '🎮', url: 'https://www.twitch.tv/mriceram' },
  { key: 'telegram', name: 'Telegram', icon: '✈',  url: 'https://t.me/IceRamTg' },
  { key: 'discord',  name: 'Discord',  icon: '💬', url: 'https://discord.gg/g5YU2n7BgA' },
  { key: 'github',   name: 'GitHub',   icon: '⌥',  url: 'https://github.com/MrIceRam' },
];

export function renderCreative(root) {
  const socialCardsHtml = SOCIALS.map(s => `
    <a href="${s.url}" target="_blank" rel="noopener" class="social-card ${s.key}" title="${s.name}">
      <span class="social-icon">${s.icon}</span>
      <span class="social-name">${s.name}</span>
    </a>
  `).join('');

  root.innerHTML = `
    <section class="page creative-page">
      <div class="page-header">
        <h1>🎬 Творчество</h1>
      </div>

      <div class="socials">${socialCardsHtml}</div>

      <div class="section-header">
        <h2 class="section-title">🎥 Мои видео</h2>
        <div class="page-actions">
          <button id="add-mine-btn" class="primary">+ Добавить</button>
        </div>
      </div>
      <div id="videos-mine" class="videos-grid">
        <p class="dim">Загрузка…</p>
      </div>

      <div class="section-header">
        <h2 class="section-title">🌟 Видео с моим участием</h2>
        <div class="page-actions">
          <button id="add-featured-btn" class="primary">+ Добавить</button>
        </div>
      </div>
      <div id="videos-featured" class="videos-grid">
        <p class="dim">Пока нет видео.</p>
      </div>
    </section>
  `;

  const mineGrid     = root.querySelector('#videos-mine');
  const featuredGrid = root.querySelector('#videos-featured');

  function getPassword() { return sessionStorage.getItem('password') || ''; }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function extractVideoId(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
      if (u.hostname.endsWith('youtube.com')) {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
        if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      }
    } catch {}
    return null;
  }

  function getThumb(v) {
    const id = extractVideoId(v.url);
    const maxres   = id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null;
    const fallback = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`     : null;
    const thumb    = v.thumbnail || maxres || fallback || '';
    return { thumb, fallback, id };
  }

  // Обычная карточка (для "чужих" видео)
  function renderCards(container, videos) {
    if (!videos.length) {
      container.innerHTML = '<p class="dim">Пока нет видео.</p>';
      return;
    }

    container.innerHTML = videos.map(v => {
      const { thumb, fallback, id } = getThumb(v);
      const title  = (v.title || '').trim() || (id ? `YouTube видео ${id}` : 'Видео');
      const author = (v.author || '').trim();

      return `
        <div class="video-card-wrap" data-id="${v.id}">
          <a class="video-card" href="${escapeAttr(v.url)}" target="_blank" rel="noopener">
            <div class="video-thumb">
              ${thumb
                ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(title)}" loading="lazy"
                        ${fallback ? `data-fallback="${escapeAttr(fallback)}"` : ''}
                        onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">`
                : `<div class="video-thumb-empty">Нет превью</div>`}
              <div class="video-play">▶</div>
            </div>
            <div class="video-info">
              <div class="video-title">${escapeHtml(title)}</div>
              ${author ? `<div class="video-author">${escapeHtml(author)}</div>` : ''}
            </div>
          </a>
          <div class="video-controls">
            <button class="video-rename" title="Переименовать">✎</button>
            <button class="video-edit-url" title="Поменять ссылку">🔗</button>
            <button class="video-move"   title="Перенести в другую категорию">⇄</button>
            <button class="video-delete" title="Удалить">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Маленькая карточка внутри hero-раздела
  function renderSmallCard(v) {
    const { thumb, fallback, id } = getThumb(v);
    const title  = (v.title || '').trim() || (id ? `YouTube видео ${id}` : 'Видео');
    const author = (v.author || '').trim();

    return `
      <div class="video-card-wrap" data-id="${v.id}">
        <a class="video-card" href="${escapeAttr(v.url)}" target="_blank" rel="noopener">
          <div class="video-thumb">
            ${thumb
              ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(title)}" loading="lazy"
                      ${fallback ? `data-fallback="${escapeAttr(fallback)}"` : ''}
                      onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">`
              : `<div class="video-thumb-empty">Нет превью</div>`}
            <div class="video-play">▶</div>
          </div>
          <div class="video-info">
            <div class="video-title">${escapeHtml(title)}</div>
            ${author ? `<div class="video-author">${escapeHtml(author)}</div>` : ''}
          </div>
        </a>
        <div class="video-controls">
          <button class="video-rename" title="Переименовать">✎</button>
          <button class="video-edit-url" title="Поменять ссылку">🔗</button>
          <button class="video-move"   title="Перенести в другую категорию">⇄</button>
          <button class="video-delete" title="Удалить">✕</button>
        </div>
      </div>
    `;
  }

  async function loadAll() {
    try {
      const res = await fetch('/api/videos');
      const all = await res.json();

      const mine     = all.filter(v => v.type === 'mine');
      const featured = all.filter(v => v.type === 'featured');

      // Сортируем: свежие сверху
      const sortedMine = [...mine].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const latest = sortedMine[0];
      const rest   = sortedMine.slice(1);

      // === Мои видео: hero + сетка ===
      if (!latest) {
        mineGrid.innerHTML = '<p class="dim">Пока нет видео.</p>';
      } else {
        const { thumb, fallback, id } = getThumb(latest);
        const heroTitle  = (latest.title || '').trim() || (id ? `YouTube видео ${id}` : 'Видео');
        const heroAuthor = (latest.author || '').trim();

        mineGrid.innerHTML = `
          <a class="video-hero" href="${escapeAttr(latest.url)}" target="_blank" rel="noopener">
            <div class="video-hero-thumb">
              ${thumb
                ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(heroTitle)}"
                        ${fallback ? `data-fallback="${escapeAttr(fallback)}"` : ''}
                        onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">`
                : ''}
              <div class="video-hero-badge">🆕 Последнее видео</div>
              <div class="video-hero-play">▶ Смотреть</div>
            </div>
            <div class="video-hero-info">
              <h3 class="video-hero-title">${escapeHtml(heroTitle)}</h3>
              <div class="video-hero-meta">
                ${heroAuthor ? `<span>${escapeHtml(heroAuthor)}</span>` : ''}
                <span class="dim">Добавлено: ${new Date(latest.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
          </a>
        `;

        // Кнопки управления hero — поверх, отдельным абсолютным блоком
        mineGrid.insertAdjacentHTML('beforeend', `
          <div class="video-hero-controls" data-id="${latest.id}">
            <button class="video-rename" title="Переименовать">✎</button>
            <button class="video-edit-url" title="Поменять ссылку">🔗</button>
            <button class="video-move" title="Перенести в другую категорию">⇄</button>
            <button class="video-delete" title="Удалить">✕</button>
          </div>
        `);

        if (rest.length) {
          mineGrid.innerHTML += `<div class="videos-grid-inner">${rest.map(renderSmallCard).join('')}</div>`;
        }
      }

      // === Чужие видео ===
      renderCards(featuredGrid, featured);
    } catch (e) {
      mineGrid.innerHTML = `<p class="dim">Ошибка: ${e.message}</p>`;
    }
  }

  async function addVideo(type) {
    if (!getPassword()) { alert('Сначала разблокируй доступ в «Закладках»'); return; }
    const url = prompt('Вставь ссылку на YouTube:');
    if (!url) return;

    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getPassword()}`,
        },
        body: JSON.stringify({ url: url.trim(), type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      await loadAll();
    } catch (e) { alert(e.message); }
  }

  root.querySelector('#add-mine-btn')     .addEventListener('click', () => addVideo('mine'));
  root.querySelector('#add-featured-btn') .addEventListener('click', () => addVideo('featured'));

  root.addEventListener('click', async (e) => {
    // Ищем ближайшую обёртку — либо карточка, либо блок кнопок hero
    const heroControls = e.target.closest('.video-hero-controls');
    const wrap = e.target.closest('.video-card-wrap');

    const id = (heroControls || wrap)?.dataset.id;
    if (!id) return;
    if (!getPassword()) { alert('Нужен пароль'); return; }

    // Удаление
    if (e.target.classList.contains('video-delete')) {
      if (!confirm('Удалить видео из списка? (само видео на YouTube останется)')) return;
      await fetch(`/api/videos/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getPassword()}` },
      });
      await loadAll();
      return;
    }

    // Переименование
    if (e.target.classList.contains('video-rename')) {
      const titleEl = (heroControls ? heroControls.parentElement.querySelector('.video-hero-title') : wrap.querySelector('.video-title'));
      const currentTitle = titleEl?.textContent || '';
      const newTitle = prompt('Новое название:', currentTitle);
      if (newTitle === null) return;
      await fetch(`/api/videos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getPassword()}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });
      await loadAll();
      return;
    }

    // Смена URL
    if (e.target.classList.contains('video-edit-url')) {
      const linkEl = (heroControls ? heroControls.parentElement.querySelector('a.video-hero') : wrap.querySelector('a.video-card'));
      const current = linkEl?.href || '';
      const newUrl = prompt('Новая ссылка на YouTube:', current);
      if (newUrl === null) return;
      const trimmed = newUrl.trim();
      if (!trimmed || trimmed === current) return;

      try {
        const res = await fetch(`/api/videos/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getPassword()}`,
          },
          body: JSON.stringify({ url: trimmed }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Не удалось обновить ссылку');
        }
        await loadAll();
      } catch (err) { alert(err.message); }
      return;
    }

    // Перенос в другую категорию
    if (e.target.classList.contains('video-move')) {
      // Определяем текущий тип по родителю
      let curType = 'mine';
      if (heroControls) {
        curType = 'mine';
      } else {
        const parent = wrap.parentElement;
        if (parent && parent.id === 'videos-featured') curType = 'featured';
      }
      const newType = curType === 'mine' ? 'featured' : 'mine';
      await fetch(`/api/videos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getPassword()}`,
        },
        body: JSON.stringify({ type: newType }),
      });
      await loadAll();
      return;
    }
  });

  loadAll();
}