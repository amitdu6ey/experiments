'use strict';
/* ============================================================
   constants & helpers
   ============================================================ */
const API = 'https://pokeapi.co/api/v2';
const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const MAXID = 151;
const FAV_KEY = 'pokedex_bookmarks';      // shared with the original Pokédex page
const BEST_KEY = 'pokebattle_best';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pretty = n => n.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TYPE_COL = { normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820', rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac' };
const badge = t => `<span class="tbadge" style="background:${TYPE_COL[t] || '#777'}">${t}</span>`;
const front = id => `${SPR}/versions/generation-v/black-white/animated/${id}.gif`;
const back = id => `${SPR}/versions/generation-v/black-white/animated/back/${id}.gif`;
const frontPng = id => `${SPR}/${id}.png`, backPng = id => `${SPR}/back/${id}.png`;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- type chart ---------- */
const CHART = {
  normal: { half: ['rock', 'steel'], none: ['ghost'] },
  fire: { sup: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'] },
  water: { sup: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] },
  electric: { sup: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], none: ['ground'] },
  grass: { sup: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice: { sup: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'] },
  fighting: { sup: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], none: ['ghost'] },
  poison: { sup: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], none: ['steel'] },
  ground: { sup: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], none: ['flying'] },
  flying: { sup: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'] },
  psychic: { sup: ['fighting', 'poison'], half: ['psychic', 'steel'], none: ['dark'] },
  bug: { sup: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { sup: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'] },
  ghost: { sup: ['psychic', 'ghost'], half: ['dark'], none: ['normal'] },
  dragon: { sup: ['dragon'], half: ['steel'], none: ['fairy'] },
  dark: { sup: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
  steel: { sup: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'] },
  fairy: { sup: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] },
};
const eff = (atk, defTypes) => defTypes.reduce((m, d) => {
  const c = CHART[atk] || {};
  return m * (c.none?.includes(d) ? 0 : c.sup?.includes(d) ? 2 : c.half?.includes(d) ? .5 : 1);
}, 1);

/* ---------- sound ---------- */
let ac, muted = store.get('pokebattle_muted', false);
function tone(f, d = .1, type = 'square', v = .05, when = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}
const sfx = {
  click: () => tone(660, .06),
  hit: () => { tone(180, .12, 'sawtooth', .08); tone(90, .15, 'square', .06, .04); },
  sup: () => { tone(220, .1, 'sawtooth', .09); tone(440, .18, 'square', .07, .08); tone(660, .12, 'square', .05, .16); },
  weak: () => tone(140, .18, 'triangle', .07),
  miss: () => tone(300, .1, 'sine', .04),
  faint: () => [400, 330, 260, 190].forEach((f, i) => tone(f, .16, 'square', .06, i * .12)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'square', .06, i * .14)),
  heal: () => [600, 800, 1000].forEach((f, i) => tone(f, .1, 'sine', .06, i * .08)),
};
$('#mute').classList.toggle('off', muted);
$('#mute').onclick = () => { muted = !muted; store.set('pokebattle_muted', muted); $('#mute').classList.toggle('off', muted); sfx.click(); };

/* ============================================================
   data layer (PokeAPI)
   ============================================================ */
const pokeCache = new Map(), moveCache = new Map(), moveSetCache = new Map();
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const getPokemon = id => pokeCache.has(id) ? pokeCache.get(id) : (pokeCache.set(id, getJSON(`${API}/pokemon/${id}`)), pokeCache.get(id));
const BAD_MOVES = new Set(['explosion', 'self-destruct', 'hyper-beam', 'giga-impact', 'solar-beam', 'solar-blade', 'sky-attack', 'razor-wind', 'skull-bash', 'fly', 'dig', 'bounce', 'dive', 'shadow-force', 'phantom-force', 'focus-punch', 'dream-eater', 'last-resort', 'future-sight', 'doom-desire', 'sucker-punch', 'fake-out', 'belch', 'synchronoise', 'steel-beam', 'mind-blown', 'misty-explosion', 'roar-of-time', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'rock-wrecker', 'meteor-assault', 'eternabeam', 'fling', 'uproar', 'outrage', 'thrash', 'petal-dance', 'rollout', 'ice-ball', 'water-spout', 'eruption', 'spit-up', 'thief', 'covet', 'struggle', 'secret-power', 'techno-blast', 'judgment', 'hidden-power', 'natural-gift']);
function getMove(url) {
  if (!moveCache.has(url)) moveCache.set(url, getJSON(url).then(j => ({
    key: j.name, name: pretty(j.name), type: j.type.name, power: j.power, acc: j.accuracy ?? 100, cls: j.damage_class.name, pp: Math.min(j.pp || 15, 25),
  })).catch(() => null));
  return moveCache.get(url);
}
const FALLBACKS = [
  { name: 'Tackle', type: 'normal', power: 40, acc: 100, cls: 'physical', pp: 25 },
  { name: 'Quick Attack', type: 'normal', power: 40, acc: 100, cls: 'physical', pp: 25 },
  { name: 'Body Slam', type: 'normal', power: 85, acc: 100, cls: 'physical', pp: 15 },
  { name: 'Slam', type: 'normal', power: 80, acc: 75, cls: 'physical', pp: 15 },
];
async function pickMoves(raw, types) {
  if (moveSetCache.has(raw.id)) return moveSetCache.get(raw.id).map(m => ({ ...m, left: m.pp }));
  const urls = shuffle(raw.moves.map(m => m.move.url));
  let found = [];
  for (let i = 0; i < Math.min(urls.length, 32) && found.length < 6; i += 8) {
    const res = await Promise.all(urls.slice(i, i + 8).map(getMove));
    found.push(...res.filter(m => m && m.power && m.power >= 30 && m.power <= 130 && m.cls !== 'status' && !BAD_MOVES.has(m.key)));
  }
  const seen = new Set(); found = found.filter(m => !seen.has(m.name) && seen.add(m.name));
  found.sort((a, b) => (types.includes(b.type) - types.includes(a.type)) || (b.power * (b.acc / 100) - a.power * (a.acc / 100)));
  const pick = found.slice(0, 4);
  for (const f of FALLBACKS) { if (pick.length >= 4) break; if (!pick.some(m => m.name === f.name)) pick.push({ ...f }); }
  moveSetCache.set(raw.id, pick);
  return pick.map(m => ({ ...m, left: m.pp }));
}
async function buildMon(id, level) {
  const raw = await getPokemon(id), base = {};
  raw.stats.forEach(s => base[s.stat.name] = s.base_stat);
  const types = raw.types.map(t => t.type.name), moves = await pickMoves(raw, types);
  const st = b => Math.floor(2 * b * level / 100) + 5;
  const maxHp = Math.floor(2 * base.hp * level / 100) + level + 10;
  return { id, name: pretty(raw.name), types, level, maxHp, hp: maxHp, atk: st(base.attack), def: st(base.defense), spa: st(base['special-attack']), spd: st(base['special-defense']), spe: st(base.speed), moves };
}

/* ============================================================
   screens
   ============================================================ */
const screens = { title: $('#title'), select: $('#select'), battle: $('#battle') };
function show(name) { Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name)); scrollTo(0, 0); }
function overlay(html) { $('#ocard').innerHTML = html; $('#overlay').classList.remove('hidden'); }
const closeOverlay = () => $('#overlay').classList.add('hidden');

/* ---------- title ---------- */
(function title() {
  const ids = [25, 6, 9, 3, 150, 94, 131, 143, 133, 149];
  $('#drift').innerHTML = ids.map((id, i) => `<img src="${front(id)}" onerror="this.onerror=null;this.src='${frontPng(id)}'" style="left:${(i * 37 + 5) % 92}%;top:${(i * 53 + 8) % 80}%;--s:${1.6 + (i % 3) * .5};animation-delay:${-i * 1.7}s;animation-duration:${10 + i}s" alt="">`).join('');
  const refresh = () => { $('#recBest').textContent = store.get(BEST_KEY, 0); $('#recFav').textContent = store.get(FAV_KEY, []).length; };
  refresh();
  $('#btnStart').onclick = () => { sfx.click(); show('select'); loadSelect(); };
  window.refreshRecords = refresh;
})();

/* ---------- team select ---------- */
let allMons = null, team = [], favs = new Set(store.get(FAV_KEY, [])), favOnly = false;
async function loadSelect() {
  if (!allMons) {
    try {
      const j = await getJSON(`${API}/pokemon?limit=${MAXID}`);
      allMons = j.results.map((r, i) => ({ id: i + 1, name: r.name }));
    } catch (e) { $('#grid').innerHTML = '<p style="padding:40px">Could not reach PokeAPI. Check your connection and reload.</p>'; return; }
  }
  renderGrid(); renderTray();
}
function renderGrid() {
  const q = $('#search').value.trim().toLowerCase();
  const list = allMons.filter(m => (!q || m.name.includes(q) || String(m.id) === q) && (!favOnly || favs.has(m.name)));
  $('#grid').innerHTML = list.length ? list.map(m => `<div class="card ${team.includes(m.id) ? 'sel' : ''}" data-id="${m.id}">
    <span class="num">#${String(m.id).padStart(3, '0')}</span><button class="star ${favs.has(m.name) ? 'on' : ''}" data-n="${m.name}">${favs.has(m.name) ? '★' : '☆'}</button>
    <img loading="lazy" src="${frontPng(m.id)}" alt=""><b>${pretty(m.name)}</b><span class="pick">${team.indexOf(m.id) + 1}</span></div>`).join('')
    : '<p style="padding:30px;color:var(--mute)">Nothing here yet. Star some Pokémon first.</p>';
}
$('#grid').addEventListener('click', e => {
  const star = e.target.closest('.star');
  if (star) {
    const n = star.dataset.n; favs.has(n) ? favs.delete(n) : favs.add(n);
    store.set(FAV_KEY, [...favs]); sfx.click();
    star.classList.toggle('on', favs.has(n)); star.textContent = favs.has(n) ? '★' : '☆';
    if (favOnly) renderGrid(); return;
  }
  const card = e.target.closest('.card'); if (!card) return;
  const id = +card.dataset.id, i = team.indexOf(id);
  if (i >= 0) team.splice(i, 1); else if (team.length < 3) { team.push(id); getPokemon(id); } else return;
  sfx.click(); renderGrid(); renderTray();
});
$('#search').oninput = renderGrid;
$('#tabAll').onclick = () => { favOnly = false; $('#tabAll').classList.add('on'); $('#tabFav').classList.remove('on'); renderGrid(); };
$('#tabFav').onclick = () => { favOnly = true; $('#tabFav').classList.add('on'); $('#tabAll').classList.remove('on'); renderGrid(); };
$('#selBack').onclick = () => { show('title'); window.refreshRecords(); };
$('#btnRandom').onclick = () => { team = shuffle(allMons.map(m => m.id)).slice(0, 3); team.forEach(getPokemon); sfx.click(); renderGrid(); renderTray(); };
function renderTray() {
  $('#slots').innerHTML = [0, 1, 2].map(i => {
    const id = team[i]; if (!id) return `<div class="slot">Pick #${i + 1}</div>`;
    const m = allMons.find(x => x.id === id);
    return `<div class="slot fill"><div><img src="${frontPng(id)}" alt=""><b>${pretty(m.name)}</b><div class="tb" id="sl${id}"></div></div></div>`;
  }).join('');
  team.forEach(id => getPokemon(id).then(r => { const el = $('#sl' + id); if (el) el.innerHTML = r.types.map(t => badge(t.type.name)).join(''); }).catch(() => {}));
  $('#btnGo').disabled = team.length < 3;
}
$('#btnGo').onclick = () => { sfx.click(); run.streak = 0; startRound(); };

/* ============================================================
   battle engine
   ============================================================ */
const run = { streak: 0 };
const B = { p: [], e: [], pi: 0, ei: 0, potions: 3, over: false, resolve: null };
const pa = () => B.p[B.pi], ea = () => B.e[B.ei];
const arena = $('#arena'), msg = $('#msg'), menu = $('#menu');

/* ---------- message box ---------- */
let sayTok = 0;
async function say(text, hold = 650) {
  const t = ++sayTok; msg.textContent = '';
  for (let i = 0; i < text.length; i++) { if (t !== sayTok) return; msg.textContent += text[i]; await sleep(16); }
  await sleep(hold);
}

/* ---------- sprites & UI ---------- */
function fit(img) {
  const k = arena.clientWidth / 980 * (img.dataset.side === 'p' ? 3.1 : 2.4);
  if (img.naturalWidth) img.style.width = img.naturalWidth * k + 'px';
}
function setSprite(side, mon) {
  const img = $(side === 'p' ? '#pImg' : '#eImg');
  img.dataset.side = side; img.className = ''; img.style.width = '';
  img.onload = () => fit(img);
  img.onerror = () => { img.onerror = null; img.src = side === 'p' ? backPng(mon.id) : frontPng(mon.id); };
  img.src = side === 'p' ? back(mon.id) : front(mon.id);
  void img.offsetWidth; img.classList.add('enter');
  setTimeout(() => img.classList.remove('enter'), 650);
}
addEventListener('resize', () => { fit($('#pImg')); fit($('#eImg')); });
function hpClass(m) { const r = m.hp / m.maxHp; return r > .5 ? '' : r > .2 ? 'mid' : 'low'; }
function paintBox(side) {
  const m = side === 'p' ? pa() : ea(), pre = side;
  $('#' + pre + 'Name').textContent = m.name; $('#' + pre + 'Lv').textContent = 'Lv' + m.level;
  $('#' + pre + 'Tys').innerHTML = m.types.map(badge).join('');
  setBar(side, m.hp, m); paintParty();
}
function setBar(side, hp, m) {
  const bar = $('#' + side + 'Bar'); bar.style.width = Math.max(0, hp / m.maxHp * 100) + '%';
  const r = hp / m.maxHp; bar.className = r > .5 ? '' : r > .2 ? 'mid' : 'low';
  if (side === 'p') $('#pNum').textContent = `${Math.max(0, Math.ceil(hp))} / ${m.maxHp}`;
}
function paintParty() {
  $('#pParty').innerHTML = B.p.map(m => `<i class="${m.hp <= 0 ? 'dead' : ''}"></i>`).join('');
  $('#eParty').innerHTML = B.e.map(m => `<i class="${m.hp <= 0 ? 'dead' : ''}"></i>`).join('');
}
async function tweenHp(side, m, to) {
  const from = m.hp, dur = 650, t0 = performance.now();
  to = Math.max(0, to);
  await new Promise(res => {
    const f = now => {
      const k = Math.min(1, (now - t0) / dur), v = from + (to - from) * k;
      setBar(side, v, m); if (k < 1) requestAnimationFrame(f); else res();
    }; requestAnimationFrame(f);
  });
  m.hp = to; setBar(side, to, m); paintParty();
}
function center(side) {
  const r = $(side === 'p' ? '#pImg' : '#eImg').getBoundingClientRect(), a = arena.getBoundingClientRect();
  return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
}
function floatText(side, text, color = '#fff') {
  const c = center(side), el = document.createElement('div');
  el.className = 'float'; el.textContent = text; el.style.cssText = `left:${c.x}px;top:${c.y - 30}px;color:${color}`;
  arena.append(el); setTimeout(() => el.remove(), 1000);
}
function shake() { arena.classList.remove('shake'); void arena.offsetWidth; arena.classList.add('shake'); }

/* ---------- particles ---------- */
const fxc = $('#fx'), fctx = fxc.getContext('2d'); let parts = [], fxOn = false;
function burst(side, color, kind) {
  const c = center(side), n = kind === 'special' ? 34 : 24;
  const r = devicePixelRatio || 1;
  fxc.width = arena.clientWidth * r; fxc.height = arena.clientHeight * r; fctx.setTransform(r, 0, 0, r, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 2 + Math.random() * 6;
    parts.push({ x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, r: 3 + Math.random() * 5, color, ring: kind === 'special' && i < 2 });
  }
  if (!fxOn) { fxOn = true; requestAnimationFrame(fxLoop); }
}
function fxLoop() {
  fctx.clearRect(0, 0, fxc.width, fxc.height);
  fctx.globalCompositeOperation = 'lighter';
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .15; p.life -= .03;
    fctx.globalAlpha = Math.max(0, p.life); fctx.fillStyle = p.color;
    if (p.ring) { fctx.strokeStyle = p.color; fctx.lineWidth = 4; fctx.beginPath(); fctx.arc(p.x, p.y, (1 - p.life) * 90, 0, 6.3); fctx.stroke(); }
    else { fctx.beginPath(); fctx.arc(p.x, p.y, p.r * p.life + 1, 0, 6.3); fctx.fill(); }
  }
  fctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(fxLoop); else { fxOn = false; fctx.clearRect(0, 0, fxc.width, fxc.height); }
}

/* ---------- menus ---------- */
function getChoice(render) { return new Promise(res => { B.resolve = v => { B.resolve = null; menu.innerHTML = ''; res(v); }; render(); }); }
function mainMenu() {
  menu.className = 'menu';
  menu.innerHTML = `<button class="mbtn main fight" data-a="fight">Fight</button><button class="mbtn main" data-a="bag">Bag ×${B.potions}</button><button class="mbtn main" data-a="switch">Switch</button><button class="mbtn main" data-a="run">Run</button>`;
  $$('button', menu).forEach(b => b.onclick = () => {
    sfx.click(); const a = b.dataset.a;
    if (a === 'fight') moveMenu(); else if (a === 'switch') switchMenu(false);
    else if (a === 'bag') bagMenu(); else { say("No running from a trainer battle!", 500).then(mainMenu); menu.innerHTML = ''; }
  });
}
function moveMenu() {
  const m = pa(), e = ea(); menu.className = 'menu moves';
  const allOut = m.moves.every(x => x.left <= 0);
  menu.innerHTML = m.moves.map((mv, i) => {
    const ef = eff(mv.type, e.types), hint = ef === 0 ? '×0' : ef > 1 ? '×' + ef : ef < 1 ? '×½' : '';
    return `<button class="mbtn mv" style="--c:${TYPE_COL[mv.type]}" data-i="${i}" ${mv.left <= 0 && !allOut ? 'disabled' : ''}>${hint ? `<span class="fx">${hint}</span>` : ''}${mv.name}<small>${mv.type} · Pow ${mv.power} · ${mv.left}/${mv.pp} PP</small></button>`;
  }).join('') + `<button class="mbtn back2" data-i="back">‹ Back</button>`;
  $$('button', menu).forEach(b => b.onclick = () => { sfx.click(); b.dataset.i === 'back' ? mainMenu() : B.resolve({ t: 'move', i: +b.dataset.i }); });
}
function switchMenu(forced) {
  menu.className = 'menu';
  menu.innerHTML = B.p.map((m, i) => `<button class="mbtn sw" data-i="${i}" ${m.hp <= 0 || i === B.pi ? 'disabled' : ''}><img src="${frontPng(m.id)}" alt=""><div>${m.name}<small>Lv${m.level} · ${Math.ceil(m.hp)}/${m.maxHp}</small><div class="mini"><i style="width:${m.hp / m.maxHp * 100}%"></i></div></div></button>`).join('')
    + (forced ? '' : `<button class="mbtn back2" data-i="back">‹ Back</button>`);
  $$('button', menu).forEach(b => b.onclick = () => { sfx.click(); b.dataset.i === 'back' ? mainMenu() : B.resolve({ t: 'switch', i: +b.dataset.i }); });
}
function bagMenu() {
  menu.className = 'menu';
  const m = pa(), can = B.potions > 0 && m.hp < m.maxHp;
  menu.innerHTML = `<button class="mbtn" data-i="potion" ${can ? '' : 'disabled'}>Potion ×${B.potions}<small>Restores half of ${m.name}'s HP</small></button><button class="mbtn back2" data-i="back">‹ Back</button>`;
  $$('button', menu).forEach(b => b.onclick = () => { sfx.click(); b.dataset.i === 'back' ? mainMenu() : B.resolve({ t: 'potion' }); });
}

/* ---------- combat ---------- */
function damage(att, def, mv) {
  const A = mv.cls === 'physical' ? att.atk : att.spa, D = mv.cls === 'physical' ? def.def : def.spd;
  const base = Math.floor(Math.floor(Math.floor(2 * att.level / 5 + 2) * mv.power * A / D) / 50) + 2;
  const e = eff(mv.type, def.types), crit = Math.random() < 1 / 16, stab = att.types.includes(mv.type) ? 1.5 : 1;
  const dmg = e === 0 ? 0 : Math.max(1, Math.floor(base * stab * e * (crit ? 1.5 : 1) * (.85 + Math.random() * .15)));
  return { dmg, e, crit };
}
function aiMove(att, def) {
  const usable = att.moves.filter(m => m.left > 0);
  if (!usable.length) return { name: 'Struggle', type: 'normal', power: 50, acc: 100, cls: 'physical', struggle: true };
  if (Math.random() < .2) return usable[Math.random() * usable.length | 0];
  return usable.map(m => ({ m, s: eff(m.type, def.types) * m.power * (m.acc / 100) * (att.types.includes(m.type) ? 1.5 : 1) })).sort((a, b) => b.s - a.s)[0].m;
}
async function attack(side, mv) {
  const att = side === 'p' ? pa() : ea(), def = side === 'p' ? ea() : pa(), dside = side === 'p' ? 'e' : 'p';
  if (side === 'p' && att.moves.every(m => m.left <= 0)) mv = { name: 'Struggle', type: 'normal', power: 50, acc: 100, cls: 'physical', struggle: true };
  if (!mv.struggle) mv.left--;
  await say(`${side === 'e' ? 'Foe ' : ''}${att.name} used ${mv.name}!`, 250);
  const img = $(side === 'p' ? '#pImg' : '#eImg'); img.classList.remove('lungeP', 'lungeE'); void img.offsetWidth;
  img.classList.add(side === 'p' ? 'lungeP' : 'lungeE'); await sleep(220);
  if (Math.random() * 100 >= mv.acc) { sfx.miss(); floatText(dside, 'MISS', '#bbb'); await say(`${att.name}'s attack missed!`); return; }
  const { dmg, e, crit } = damage(att, def, mv);
  if (e === 0) { sfx.weak(); await say(`It doesn't affect ${def.name}...`); return; }
  const dimg = $(dside === 'p' ? '#pImg' : '#eImg'); dimg.classList.remove('hit'); void dimg.offsetWidth; dimg.classList.add('hit');
  burst(dside, TYPE_COL[mv.type], mv.cls);
  (e > 1 ? sfx.sup : e < 1 ? sfx.weak : sfx.hit)();
  if (e > 1 || crit) shake();
  floatText(dside, '-' + Math.min(dmg, def.hp), e > 1 ? '#ffd23f' : e < 1 ? '#aab' : '#fff');
  await tweenHp(dside, def, def.hp - dmg);
  if (crit) await say('A critical hit!', 450);
  if (e > 1) await say("It's super effective!", 500); else if (e < 1) await say("It's not very effective...", 500);
  if (def.hp <= 0) await faint(dside);
}
async function faint(side) {
  const m = side === 'p' ? pa() : ea(), img = $(side === 'p' ? '#pImg' : '#eImg');
  sfx.faint(); img.classList.add('faint');
  await say(`${side === 'e' ? 'Foe ' : ''}${m.name} fainted!`, 700);
  paintParty();
  if (side === 'e') {
    if (B.e.some(x => x.hp > 0)) { B.ei = B.e.findIndex(x => x.hp > 0); await sendOut('e', true); }
    else B.over = 'win';
  } else {
    if (B.p.some(x => x.hp > 0)) {
      await say('Choose your next Pokémon!', 200);
      const c = await getChoice(() => switchMenu(true));
      B.pi = c.i; await sendOut('p', true);
    } else B.over = 'lose';
  }
}
async function sendOut(side, announce) {
  const m = side === 'p' ? pa() : ea();
  setSprite(side, m); paintBox(side);
  if (announce) await say(side === 'p' ? `Go, ${m.name}!` : `Foe sends out ${m.name}!`, 450);
}
async function turn(act) {
  const P = pa(), E = ea(), em = aiMove(E, P);
  if (act.t === 'switch') {
    await say(`Come back, ${P.name}!`, 250); B.pi = act.i; await sendOut('p', true); if (!B.over) await attack('e', em);
  } else if (act.t === 'potion') {
    B.potions--; const heal = Math.ceil(P.maxHp / 2), to = Math.min(P.maxHp, P.hp + heal);
    sfx.heal(); floatText('p', '+' + (to - P.hp), '#6f6'); await tweenHp('p', P, to);
    await say(`${P.name} recovered some HP!`, 400); await attack('e', em);
  } else {
    const pm = P.moves[act.i], pFirst = P.spe > E.spe || (P.spe === E.spe && Math.random() < .5);
    if (pFirst) { await attack('p', pm); if (!B.over && E.hp > 0 && P.hp > 0) await attack('e', em); }
    else { await attack('e', em); if (!B.over && P.hp > 0 && E.hp > 0) await attack('p', pm); }
  }
}

/* ---------- round flow ---------- */
const THEMES = ['', 't1', 't2', 't3'];
async function startRound() {
  show('battle'); closeOverlay();
  overlay('<div class="spin"></div><h3>Scouting your rival…</h3><p>Fetching Pokémon from PokeAPI</p>');
  const lvP = 50 + run.streak * 2, lvE = 50 + run.streak * 4;
  try {
    const LEGEND = [144, 145, 146, 150, 151];
    const foes = shuffle(allMons.map(m => m.id).filter(id => !team.includes(id) && (run.streak >= 3 || !LEGEND.includes(id)))).slice(0, 3);
    B.p = await Promise.all(team.map(id => buildMon(id, lvP)));
    B.e = await Promise.all(foes.map(id => buildMon(id, lvE)));
  } catch (e) {
    overlay(`<h3>Connection problem</h3><p>Couldn't load data from PokeAPI.</p><div class="row"><button class="big sm" id="retry">Retry</button><button class="ghost" id="toTitle">Back</button></div>`);
    $('#retry').onclick = startRound; $('#toTitle').onclick = () => { closeOverlay(); show('select'); }; return;
  }
  closeOverlay();
  Object.assign(B, { pi: 0, ei: 0, potions: 3, over: false });
  arena.className = 'arena ' + THEMES[run.streak % THEMES.length];
  $('#roundTag').textContent = `Round ${run.streak + 1}`;
  $('#pImg').removeAttribute('src'); $('#eImg').removeAttribute('src');
  await say(`Trainer challenges you! (Round ${run.streak + 1})`, 600);
  await sendOut('e', true); await sendOut('p', true);
  while (!B.over) {
    await say(`What will ${pa().name} do?`, 0);
    const act = await getChoice(mainMenu);
    await turn(act);
  }
  endRound();
}
function endRound() {
  const best = store.get(BEST_KEY, 0);
  if (B.over === 'win') {
    run.streak++; sfx.win(); if (run.streak > best) store.set(BEST_KEY, run.streak);
    burst('e', '#f5c518', 'special'); burst('p', '#f5c518', 'special');
    overlay(`<h3>Victory!</h3><div class="stat">${run.streak}</div><p>Win streak. Your team has healed and grown stronger, but the next trainer is tougher.</p><div class="row"><button class="big sm" id="next">Next battle</button><button class="ghost" id="newteam">Change team</button></div>`);
    $('#next').onclick = () => startRound();
    $('#newteam').onclick = () => { closeOverlay(); show('select'); renderGrid(); renderTray(); };
  } else {
    const bestNow = Math.max(best, run.streak);
    overlay(`<h3>Defeated…</h3><div class="stat">${run.streak}</div><p>Battles won this run. Best streak: ${bestNow}.</p><div class="row"><button class="big sm" id="again">Try again</button><button class="ghost" id="newteam">Change team</button></div>`);
    $('#again').onclick = () => { run.streak = 0; startRound(); };
    $('#newteam').onclick = () => { run.streak = 0; closeOverlay(); show('select'); renderGrid(); renderTray(); };
  }
  window.refreshRecords();
}
