export function renderHome(root) {
  root.innerHTML = `
    <section class="home">
      <div class="home-hero">
        <div class="hero-photo">📸</div>
        <h1>Привет!</h1>
        <p class="dim">Тут будет твоё фото и ссылки на разделы</p>
      </div>
      <div class="home-cards">
        <a href="#/photos" class="card">
          <span>🖼️</span><h3>Фото</h3><p>Картинки для закладок</p>
        </a>
        <a href="#/creative" class="card">
          <span>🎬</span><h3>Творчество</h3><p>Соцсети и видео</p>
        </a>
        <a href="#/bookmarks" class="card">
          <span>🔖</span><h3>Закладки</h3><p>Ссылки и связи</p>
        </a>
      </div>
    </section>
  `;
}