const CACHE_KEY = 'yt-metadata-v3';  // v3 → старый кэш сбросится
const CACHE_TTL = 24 * 60 * 60 * 1000;

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

      <h2 class="section-title">🎥 Мои видео</h2>
      <div id="videos-grid" class="videos-grid">
        <p class="dim">Загрузка…</p>
      </div>

      <h2 class="section-title" id="featured-title" style="display:none">🌟 Видео с моим участием</h2>
      <div id="featured-grid" class="videos-grid"></div>
    </section>
  `;

  const mineGrid      = root.querySelector('#videos-grid');
  const featuredGrid  = root.querySelector('#featured-grid');
  const featuredTitle = root.querySelector('#featured-title');

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function extractVideoId(url) {
    if (!url) return null;
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

  // items: массив { url, title? }
  async function loadMetadata(items) {
    if (!items.length) return [];

    const urls = items.map(i => i.url);
    let data = [];

    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      const urlsKey = JSON.stringify(urls);
      if (cached && cached.ts > Date.now() - CACHE_TTL &&
          JSON.stringify(cached.urls) === urlsKey) {
        data = cached.data;
      }
    } catch {}

    if (!data.length) {
      const res = await fetch('/api/youtube-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error('Failed to fetch video metadata');
      data = await res.json();

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          ts: Date.now(),
          urls,
          data,
        }));
      } catch {}
    }

    // Смерджить: ручной title из JSON имеет приоритет
    return items.map((item, idx) => ({
      url: item.url,
      manualTitle: (item.title || '').trim(),
      meta: data[idx] || {},
    }));
  }

  function renderVideoCards(container, items) {
    if (!items.length) {
      container.innerHTML = '<p class="dim">Пока нет видео.</p>';
      return;
    }

    container.innerHTML = items.map(item => {
      const id = extractVideoId(item.url);
      const maxres   = id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null;
      const fallback = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`     : null;
      const metaThumb = item.meta.thumbnail;
      const thumb = metaThumb || maxres || fallback || '';

      // Приоритет: ручной title → oEmbed title → fallback
      let title = item.manualTitle
        || (item.meta.title || '').trim()
        || (id ? `YouTube видео ${id}` : 'YouTube видео');

      const author = (item.meta.author || '').trim();

      return `
        <a class="video-card" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">
          <div class="video-thumb">
            ${thumb
              ? `<img src="${escapeAttr(thumb)}"
                       alt="${escapeAttr(title)}"
                       loading="lazy"
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
      `;
    }).join('');
  }

  async function init() {
    try {
      const res = await fetch('/data/videos.json');
      if (!res.ok) throw new Error('Не удалось загрузить /data/videos.json');
      const cfg = await res.json();

      // Поддержка как объектов {url, title}, так и просто строк
      const normalize = arr => (arr || [])
        .map(item => typeof item === 'string'
          ? { url: item, title: '' }
          : item
        )
        .filter(item => item && typeof item.url === 'string' && item.url.trim());

      const mine     = normalize(cfg.mine);
      const featured = normalize(cfg.featured);

      if (!mine.length) {
        mineGrid.innerHTML = '<p class="dim">Добавь свои ссылки в <code>public/data/videos.json</code> → <code>mine</code>.</p>';
      } else {
        const items = await loadMetadata(mine);
        renderVideoCards(mineGrid, items);
      }

      if (featured.length) {
        featuredTitle.style.display = '';
        const items = await loadMetadata(featured);
        renderVideoCards(featuredGrid, items);
      }
    } catch (e) {
      mineGrid.innerHTML = `<p class="dim">Ошибка: ${e.message}</p>`;
    }
  }

  init();
}