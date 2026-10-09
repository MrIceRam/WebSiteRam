import { renderHome } from './views/home.js';
import { renderPhotos } from './views/photos.js';
import { renderCreative } from './views/creative.js';
import { renderBookmarks } from './views/bookmarks.js';

const routes = {
  '': renderHome,
  '#/': renderHome,
  '#/photos': renderPhotos,
  '#/creative': renderCreative,
  '#/bookmarks': renderBookmarks,
};

function updateActiveNav(hash) {
  document.querySelectorAll('.topnav a').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === hash);
  });
}

function router() {
  const hash = location.hash || '#/';
  const render = routes[hash] || renderHome;
  const app = document.getElementById('app');
  app.innerHTML = '';
  render(app);
  updateActiveNav(hash);
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);