/* ── Constants ──────────────────────────────────────────────────────────── */
const API_BASE   = 'https://pokeapi.co/api/v2';
const PAGE_SIZE  = 20;
const STORAGE_KEY = 'pokedex_bookmarks';

/* ── State ──────────────────────────────────────────────────────────────── */
let offset       = 0;
let isLoading    = false;
let viewMode     = 'all';   // 'all' | 'bookmarks'
let bookmarks    = loadBookmarks();

/* ── DOM refs ───────────────────────────────────────────────────────────── */
const grid          = document.getElementById('grid');
const btnAll        = document.getElementById('btn-all');
const btnBookmarks  = document.getElementById('btn-bookmarks');
const bookmarkCount = document.getElementById('bookmark-count');
const btnLoadMore   = document.getElementById('btn-load-more');
const loadMoreWrap  = document.getElementById('load-more-wrapper');
const emptyMsg      = document.getElementById('empty-msg');
const modalOverlay  = document.getElementById('modal-overlay');
const modalContent  = document.getElementById('modal-content');
const modalClose    = document.getElementById('modal-close');

/* ── Bookmark persistence ───────────────────────────────────────────────── */
function loadBookmarks() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveBookmarks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...bookmarks]));
}
function toggleBookmark(name, event) {
  if (event) event.stopPropagation();
  if (bookmarks.has(name)) { bookmarks.delete(name); } else { bookmarks.add(name); }
  saveBookmarks();
  updateBookmarkCount();
  // Update all bookmark icons for this pokemon visible on page
  document.querySelectorAll(`[data-bookmark="${name}"]`).forEach(el => {
    el.classList.toggle('bookmarked', bookmarks.has(name));
    el.textContent = bookmarks.has(name) ? '★' : '☆';
  });
  if (viewMode === 'bookmarks') renderBookmarksView();
}
function updateBookmarkCount() {
  bookmarkCount.textContent = bookmarks.size;
}

/* ── Type colour helper ─────────────────────────────────────────────────── */
function typeBadge(type) {
  const cls = `type-${type}`;
  return `<span class="type-badge ${cls}" style="">${type}</span>`;
}

/* ── Fetch helpers ──────────────────────────────────────────────────────── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchPokemon(nameOrId) {
  return fetchJSON(`${API_BASE}/pokemon/${nameOrId}`);
}
async function fetchPokemonList(limit, off) {
  return fetchJSON(`${API_BASE}/pokemon?limit=${limit}&offset=${off}`);
}

/* ── Sprite helper ──────────────────────────────────────────────────────── */
function getSprite(data) {
  return (
    data.sprites?.other?.['official-artwork']?.front_default ||
    data.sprites?.front_default ||
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'
  );
}

/* ── Card rendering ─────────────────────────────────────────────────────── */
function createCard(data) {
  const { name, id, types } = data;
  const sprite   = getSprite(data);
  const isMarked = bookmarks.has(name);
  const typeHtml = types.map(t => typeBadge(t.type.name)).join('');
  const padId    = String(id).padStart(3, '0');

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-img-wrap">
      <img src="${sprite}" alt="${name}" loading="lazy" />
      <button class="card-bookmark ${isMarked ? 'bookmarked' : ''}"
              data-bookmark="${name}"
              aria-label="${isMarked ? 'Remove bookmark' : 'Bookmark'} ${name}">
        ${isMarked ? '★' : '☆'}
      </button>
    </div>
    <div class="card-body">
      <div class="card-id">#${padId}</div>
      <div class="card-name">${name}</div>
      <div class="types">${typeHtml}</div>
    </div>`;

  card.querySelector('.card-bookmark').addEventListener('click', e => toggleBookmark(name, e));
  card.addEventListener('click', () => openModal(name));
  return card;
}

function addSkeletons(count) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'skeleton skeleton-card';
    el.dataset.skeleton = 'true';
    grid.appendChild(el);
  }
}
function removeSkeletons() {
  grid.querySelectorAll('[data-skeleton]').forEach(el => el.remove());
}

/* ── All Pokemon view ───────────────────────────────────────────────────── */
async function loadNextPage() {
  if (isLoading) return;
  isLoading = true;
  btnLoadMore.disabled = true;
  addSkeletons(PAGE_SIZE);

  try {
    const list = await fetchPokemonList(PAGE_SIZE, offset);
    removeSkeletons();

    const details = await Promise.all(list.results.map(p => fetchPokemon(p.name)));
    details.forEach(d => grid.appendChild(createCard(d)));

    offset += PAGE_SIZE;
    if (!list.next) loadMoreWrap.classList.add('hidden');
  } catch (err) {
    removeSkeletons();
    console.error('Failed to load Pokemon:', err);
  } finally {
    isLoading = false;
    btnLoadMore.disabled = false;
  }
}

/* ── Bookmarks view ─────────────────────────────────────────────────────── */
async function renderBookmarksView() {
  grid.innerHTML = '';
  loadMoreWrap.classList.add('hidden');

  if (bookmarks.size === 0) { emptyMsg.classList.remove('hidden'); return; }
  emptyMsg.classList.add('hidden');
  addSkeletons(bookmarks.size);

  try {
    const details = await Promise.all([...bookmarks].map(n => fetchPokemon(n)));
    removeSkeletons();
    details.forEach(d => grid.appendChild(createCard(d)));
  } catch (err) {
    removeSkeletons();
    console.error('Failed to load bookmarks:', err);
  }
}

/* ── View switching ─────────────────────────────────────────────────────── */
function switchView(mode) {
  viewMode = mode;
  btnAll.classList.toggle('active', mode === 'all');
  btnBookmarks.classList.toggle('active', mode === 'bookmarks');
  emptyMsg.classList.add('hidden');

  if (mode === 'all') {
    grid.innerHTML = '';
    offset = 0;
    loadMoreWrap.classList.remove('hidden');
    loadNextPage();
  } else {
    renderBookmarksView();
  }
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
async function openModal(name) {
  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalContent.innerHTML = `<div style="padding:2rem;text-align:center;color:#aaa">Loading…</div>`;

  try {
    const data = await fetchPokemon(name);
    renderModal(data);
  } catch (err) {
    modalContent.innerHTML = `<div style="padding:2rem;color:red">Failed to load details.</div>`;
    console.error(err);
  }
}
function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderModal(data) {
  const { name, id, types, stats, abilities, height, weight, base_experience } = data;
  const sprite   = getSprite(data);
  const isMarked = bookmarks.has(name);
  const padId    = String(id).padStart(3, '0');
  const typeHtml = types.map(t => typeBadge(t.type.name)).join('');

  const statMap = { hp: 'HP', attack: 'ATK', defense: 'DEF', 'special-attack': 'Sp.ATK', 'special-defense': 'Sp.DEF', speed: 'SPD' };

  const statsHtml = stats.map(s => {
    const label = statMap[s.stat.name] || s.stat.name;
    const val   = s.base_stat;
    const pct   = Math.min(100, Math.round(val / 255 * 100));
    return `<div class="stat-row">
      <span class="stat-name">${label}</span>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      <span class="stat-val">${val}</span>
    </div>`;
  }).join('');

  const abilitiesHtml = abilities.map(a =>
    `<span class="ability-tag">${a.ability.name.replace('-', ' ')}${a.is_hidden ? ' <em>(hidden)</em>' : ''}</span>`
  ).join('');

  modalContent.innerHTML = `
    <div class="modal-hero">
      <button class="modal-bookmark-btn ${isMarked ? 'bookmarked' : ''}"
              data-bookmark="${name}"
              aria-label="${isMarked ? 'Remove bookmark' : 'Bookmark'}">
        ${isMarked ? '★' : '☆'}
      </button>
      <img src="${sprite}" alt="${name}" />
    </div>
    <div class="modal-body">
      <div class="modal-id">#${padId}</div>
      <h2 class="modal-name" id="modal-name">${name}</h2>
      <div class="modal-types">${typeHtml}</div>
      <div class="modal-meta">
        <div class="meta-item"><div class="meta-label">Height</div><div class="meta-value">${(height / 10).toFixed(1)} m</div></div>
        <div class="meta-item"><div class="meta-label">Weight</div><div class="meta-value">${(weight / 10).toFixed(1)} kg</div></div>
        <div class="meta-item"><div class="meta-label">Base XP</div><div class="meta-value">${base_experience ?? '—'}</div></div>
        <div class="meta-item"><div class="meta-label">Abilities</div><div class="meta-value">${abilities.length}</div></div>
      </div>
      <div class="section-title">Base Stats</div>
      <div class="stats">${statsHtml}</div>
      <div class="section-title">Abilities</div>
      <div class="abilities">${abilitiesHtml}</div>
    </div>`;

  modalContent.querySelector('.modal-bookmark-btn').addEventListener('click', e => {
    toggleBookmark(name, e);
    const btn = modalContent.querySelector('.modal-bookmark-btn');
    btn.classList.toggle('bookmarked', bookmarks.has(name));
    btn.textContent = bookmarks.has(name) ? '★' : '☆';
  });
}

/* ── Events ─────────────────────────────────────────────────────────────── */
btnAll.addEventListener('click', () => switchView('all'));
btnBookmarks.addEventListener('click', () => switchView('bookmarks'));
btnLoadMore.addEventListener('click', loadNextPage);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── Init ───────────────────────────────────────────────────────────────── */
updateBookmarkCount();
loadNextPage();
