// GFXWRLD Public: home crates, search, and the left-hand filter panel.
(() => {
// The same files run the standalone site and the page on gfxwrld.com. A host
// page only needs an element marked data-gfx-app inside a .gfxp wrapper; the
// markup below is placed into it, and every request goes back to the site
// these scripts were loaded from.
const GFX_ORIGIN = document.currentScript ? new URL(document.currentScript.src).origin : '';
const GFX_MARKUP = `
  <section class="panel" aria-label="Search">
    <div class="ph"><i></i>ARCHIVE_SEARCH @ 100%<span class="spacer"></span><button type="button" class="savedbtn" id="saved">Saved <b id="savedn">0</b></button></div>
    <form id="f">
      <label for="q" class="sr">Search the archives</label>
      <input id="q" type="search" placeholder="Skull, eagle, boxing" autocomplete="off">
      <button class="go" type="submit">Search<span aria-hidden="true">&rarr;</span></button>
    </form>
  </section>

  <div class="chiprow" id="chiprow" hidden><span class="lbl dim" id="chiplbl"></span><div class="chips" id="chips"></div></div>

  <div class="layout">
    <details class="panel filters" id="filters" open>
      <summary class="ph"><i></i>FILTERS<span class="spacer"></span><span id="fcount" class="lime"></span></summary>
      <div id="fbody"></div>
      <div class="fnote">
        <button type="button" class="btn g small" id="reset">Reset filters</button>
        <p class="note">Filters apply to every crate and search you open.</p>
      </div>
    </details>

    <div class="content">
      <section id="home" class="stack">
        <div class="bar"><h2>Start with a crate</h2><span class="lbl dim">Pulled live from the archives</span></div>
        <div class="crates" id="crates"></div>
      </section>

      <section id="results" class="stack" hidden>
        <div class="bar"><h2 id="rt"></h2><span class="tools"><button type="button" class="btn g small" id="view" aria-pressed="false">Wall view</button><button type="button" class="btn g small" id="back">&larr;&nbsp; All crates</button></span></div>
        <div class="trail" id="trail" hidden><span class="lbl dim">Trail</span><div id="trailrow"></div></div>
        <p class="lbl dim" id="status" aria-live="polite"></p>
        <div class="cols">
          <div class="grid" id="grid"></div>
          <aside class="panel detail" id="detail" hidden aria-label="Selected image"></aside>
        </div>
        <button type="button" class="btn g more" id="more" hidden>Load more</button>
        <div class="msg" id="msg" hidden></div>
      </section>
    </div>
  </div>
`;
const gfxMount = document.querySelector('[data-gfx-app]');
if (gfxMount && !document.getElementById('f')) gfxMount.innerHTML = GFX_MARKUP;
const gfxRoot = document.querySelector('.gfxp') || document.body;
// Back to the top of the tool, not the top of the host page.
const toTop = () => { if (gfxRoot.getBoundingClientRect().top < 0) gfxRoot.scrollIntoView(); };
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, kids = []) => { if (tag === 'img') props = { referrerPolicy: 'no-referrer', ...props }; const n = Object.assign(document.createElement(tag), props); kids.forEach((k) => n.append(k)); return n; };

const ARCHIVES = ['The Met', 'Art Institute of Chicago', 'Cleveland Museum of Art', 'Smithsonian', 'Europeana', 'Wikimedia Commons'];
const TYPES = ['Prints', 'Drawings', 'Paintings', 'Photographs', 'Objects', 'Not labelled'];
const PRINT_MIN = 3000;

// Each museum labels its works differently, so they are sorted into a few
// plain groups a designer would recognise.
function typeOf(it) {
  const t = (it.type || '').toLowerCase();
  if (!t) return 'Not labelled';
  if (/print|engrav|etch|woodcut|woodblock|lithograph|mezzotint|aquatint|poster/.test(t)) return 'Prints';
  if (/draw|chalk|graphite|charcoal|pastel|watercolor|pen and|ink/.test(t)) return 'Drawings';
  if (/paint|oil on|tempera/.test(t)) return 'Paintings';
  if (/photo|gelatin|albumen|daguerre/.test(t)) return 'Photographs';
  return 'Objects';
}
const isPrintReady = (it) => Boolean(it.width && it.height && Math.min(it.width, it.height) >= PRINT_MIN);

const state = { items: [], q: '', page: 0, more: false, offArchives: new Set(), types: new Set(), printReady: false };
const api = (path) => GFX_ORIGIN + path;
// A small, fast copy of an archive image for covers and result cards. The
// archives only offer large files, so these are resized on the way through.
const small = (u, w) => api('/_vercel/image?url=' + encodeURIComponent(u) + '&w=' + w + '&q=70');
// An image element that shows the small copy and falls back to the archive's
// own file if the small copy cannot be made.
function thumb(it, w, props, onFail) {
  const img = el('img', { alt: '', ...props, src: small(it.thumb, w) });
  let triedOriginal = false;
  img.addEventListener('error', () => {
    if (!triedOriginal) { triedOriginal = true; img.src = it.thumb; } else onFail(img);
  });
  return img;
}
const proxied = (u) => api('/api/img?u=' + encodeURIComponent(u));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const downloadLink = (it) => proxied(it.image) + '&dl=1&name=' + encodeURIComponent('gfxwrld-' + (slug(it.title) || it.id));
const megabytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
// The address of the page with the current search and, when one is open, the image.
function setAddress(itemId) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (itemId) p.set('i', itemId);
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}
const passes = (it) => !state.offArchives.has(it.source) && (state.types.size === 0 || state.types.has(typeOf(it))) && (!state.printReady || isPrintReady(it));

function option(label, checked, count, onChange) {
  const box = el('input', { type: 'checkbox', checked });
  box.addEventListener('change', () => onChange(box.checked));
  const kids = [box, el('span', { textContent: label })];
  if (count !== null) kids.push(el('span', { className: 'n', textContent: String(count) }));
  return el('label', { className: 'opt' + (count === 0 ? ' off' : '') }, kids);
}

function renderFilters() {
  const has = state.items.length > 0;
  const count = (fn) => (has ? state.items.filter(fn).length : null);
  const group = (title, opts) => el('div', { className: 'fgroup' }, [el('h3', { textContent: title }), ...opts]);
  $('fbody').replaceChildren(
    group('Archive', ARCHIVES.map((a) => option(a, !state.offArchives.has(a), count((it) => it.source === a), (on) => { if (on) state.offArchives.delete(a); else state.offArchives.add(a); update(); }))),
    group('Type', TYPES.map((t) => option(t, state.types.has(t), count((it) => typeOf(it) === t), (on) => { if (on) state.types.add(t); else state.types.delete(t); update(); }))),
    group('Size', [option('Print ready / ' + PRINT_MIN + 'px+', state.printReady, count(isPrintReady), (on) => { state.printReady = on; update(); })])
  );
  const active = state.offArchives.size + state.types.size + (state.printReady ? 1 : 0);
  $('fcount').textContent = active ? active + ' ON' : '';
  $('reset').hidden = active === 0;
}

// Saved images. Kept in this browser only for now (no account needed), so they
// are still here on the next visit from the same device.
const saved = new Map();
try { for (const it of JSON.parse(localStorage.getItem('gfxp-saved') || '[]')) if (it && it.id) saved.set(it.id, it); } catch (e) { /* starts empty */ }
function paintSavedCount() { $('savedn').textContent = String(saved.size); $('saved').classList.toggle('has', saved.size > 0); }
function toggleSaved(it) {
  if (saved.has(it.id)) saved.delete(it.id); else saved.set(it.id, it);
  try { localStorage.setItem('gfxp-saved', JSON.stringify([...saved.values()].slice(-300))); } catch (e) { /* kept for this visit only */ }
  paintSavedCount();
}
function showSaved() {
  state.q = ''; state.page = 0; state.more = false;
  state.items = [...saved.values()].reverse();
  $('q').value = '';
  setAddress(null);
  $('home').hidden = true; $('results').hidden = false;
  $('rt').textContent = 'Saved';
  $('detail').hidden = true;
  update();
  if (!state.items.length) { $('status').textContent = ''; $('msg').hidden = false; $('msg').textContent = 'Nothing saved yet. Hover an image and press Save.'; }
  toTop();
}

// Chips under the search box. On the home page they are starting points; after
// a search they are ways to go deeper, drawn from what came back: the makers
// and kinds of work that turn up more than once.
let starters = [];
function chip(label, image, go) {
  const b = el('button', { type: 'button', className: 'chip' });
  if (image) b.append(thumb({ thumb: image }, 192, { decoding: 'async' }, (img) => img.remove()));
  b.append(el('span', { textContent: label }));
  b.addEventListener('click', go);
  return b;
}
function relatedChips() {
  const makers = new Map(), kinds = new Map();
  const words = state.q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const add = (map, key, it) => { const e = map.get(key) || { n: 0, it }; e.n++; map.set(key, e); };
  for (const it of state.items) {
    // One museum writes "Kitagawa Utamaro", another "Utamaro, Kitagawa".
    let m = String(it.maker || '').split('(')[0].trim();
    const parts = m.split(',').map((x) => x.trim());
    if (parts.length === 2 && parts[1] && !/\d/.test(parts[1])) m = parts[1] + ' ' + parts[0];
    if (m && m.length < 40 && !/unknown|anonymous|artist/i.test(m)) add(makers, m, it);
    // Kinds of work that would only repeat the search ("woodblock print" under
    // a woodblock search, or plain "print" twice) are left out.
    const k = String(it.type || '').trim().toLowerCase().replace(/s$/, '');
    if (k && k.length < 28 && !words.some((w) => k.includes(w.slice(0, 5)))) add(kinds, k, it);
  }
  const top = (map, max) => [...map.entries()].filter(([, e]) => e.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, max);
  const q = state.q.toLowerCase();
  return [
    ...top(makers, 4).filter(([m]) => m.toLowerCase() !== q).map(([m, e]) => chip(m, e.it.thumb, () => { run(m); toTop(); })),
    ...top(kinds, 4).filter(([k]) => !q.includes(k.toLowerCase())).map(([k, e]) => chip(state.q + ' / ' + k, e.it.thumb, () => { run(state.q + ' ' + k, state.q + ' / ' + k); toTop(); })),
  ];
}
function renderChips() {
  const home = $('results').hidden;
  const list = home ? starters.map((c) => chip(c.label, c.thumb, () => { run(c.q, c.label); toTop(); })) : relatedChips();
  $('chiplbl').textContent = home ? 'Try' : 'Go deeper';
  $('chips').replaceChildren(...list);
  $('chiprow').hidden = list.length === 0;
}
async function loadChips() {
  try {
    const r = await fetch(api('/api/chips'));
    const data = await r.json();
    starters = (data.chips || []).filter((c) => c.q);
    renderChips();
  } catch (e) { /* the page works without them */ }
}

// The trail: the images opened so far, newest first, so a find is never lost
// while following chips into other searches.
const trail = [];
function renderTrail() {
  $('trail').hidden = trail.length < 2;
  $('trailrow').replaceChildren(...trail.map((t) => {
    const b = el('button', { type: 'button', className: 'crumb', title: t.it.title });
    b.setAttribute('aria-label', 'Back to ' + t.it.title);
    b.append(thumb(t.it, 192, { decoding: 'async' }, () => b.remove()));
    b.addEventListener('click', () => {
      if (state.q === t.q && cards.get(t.it.id)) showDetail(t.it, cards.get(t.it.id));
      else run(t.q, t.label, t.it.id);
    });
    return b;
  }));
}
function remember(it) {
  const at = trail.findIndex((t) => t.it.id === it.id);
  if (at >= 0) trail.splice(at, 1);
  trail.unshift({ it, q: state.q, label: $('rt').textContent });
  if (trail.length > 10) trail.pop();
  renderTrail();
}

// Wall view: images only, edge to edge, captions on hover. The choice is kept
// for next time where the browser allows it.
function setWall(on) {
  gfxRoot.classList.toggle('wall', on);
  $('view').setAttribute('aria-pressed', String(on));
  $('view').textContent = on ? 'Grid view' : 'Wall view';
  try { localStorage.setItem('gfxp-wall', on ? '1' : '0'); } catch (e) { /* not kept, still works */ }
}

function showDetail(it, card) {
  document.querySelectorAll('.gfxp .card').forEach((c) => { c.classList.toggle('on', c === card); const b = c.querySelector('.pick'); if (b) b.setAttribute('aria-pressed', String(c === card)); });
  const known = it.width && it.height;
  const sizeCell = el('span', { textContent: known ? it.width + ' x ' + it.height + ' px' : 'Checking' });
  const row = (k, v) => el('div', { className: 'row' }, [el('span', { textContent: k }), typeof v === 'string' ? el('span', { textContent: v }) : v]);
  const img = el('img', { src: it.thumb, alt: it.title });
  img.addEventListener('error', () => img.remove());
  const copy = el('button', { type: 'button', className: 'btn g', textContent: 'Copy link to this image' });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); copy.textContent = 'Link copied'; }
    catch (e) { copy.textContent = 'Copy it from the address bar'; }
    setTimeout(() => { copy.textContent = 'Copy link to this image'; }, 2500);
  });
  const dl = el('a', { className: 'btn p', href: downloadLink(it), textContent: 'Download image' });
  $('detail').replaceChildren(
    el('div', { className: 'ph' }, [el('i'), it.id.toUpperCase().slice(0, 24) + ' @ 100%']),
    img,
    el('h3', { textContent: it.title }),
    row('Source', it.via ? it.via + ' via ' + it.source : it.source),
    row('Maker', it.maker || 'Unknown'),
    row('Date', it.date || 'Unknown'),
    row('Type', it.type || 'Not labelled'),
    row('Rights', it.rights === 'CC0' ? 'CC0 / public domain' : 'Public domain'),
    row('Size', sizeCell),
    el('div', { className: 'acts' }, [
      dl,
      el('a', { className: 'btn g', href: it.link, target: '_blank', rel: 'noopener', textContent: 'View original record' }),
      copy,
      el('p', { className: 'note', textContent: 'Public domain covers copyright only. Trademarks, logos and a real person\'s likeness can still need permission. Check before you print.' }),
    ])
  );
  $('detail').hidden = false;
  setAddress(it.id);
  remember(it);
  // Some archives do not say how big their files are, so the file is measured.
  // The answer is kept on the item, which also lets the Print ready filter see it.
  fetch(api('/api/size?u=' + encodeURIComponent(it.image))).then((r) => (r.ok ? r.json() : null)).then((s) => {
    if (!s) { if (!known) sizeCell.textContent = 'See source'; return; }
    if (s.width && s.height) { it.width = s.width; it.height = s.height; }
    const px = it.width && it.height ? it.width + ' x ' + it.height + ' px' : 'See source';
    sizeCell.textContent = px + (s.bytes ? ' / ' + megabytes(s.bytes) : '');
  }).catch(() => { if (!known) sizeCell.textContent = 'See source'; });
  // Lets add-ons such as the background remover attach to the open panel.
  document.dispatchEvent(new CustomEvent('gfx:detail', { detail: { item: it } }));
}

const cards = new Map();

function renderGrid() {
  if ($('results').hidden) return;
  const shown = state.items.filter(passes);
  const open = new URLSearchParams(location.search).get('i');
  $('detail').hidden = true;
  $('status').textContent = state.items.length ? shown.length + ' of ' + state.items.length + ' shown / public domain only' : '';
  cards.clear();
  $('more').hidden = !state.more;
  $('grid').replaceChildren(...shown.map((it) => {
    // A result whose image will not load is no use to anyone: drop the card.
    const img = thumb(it, 384, { loading: 'lazy', decoding: 'async' }, () => card.remove());
    const open = () => showDetail(it, card);
    const pick = el('button', { type: 'button', className: 'pick' }, [img]);
    pick.setAttribute('aria-pressed', 'false');
    pick.setAttribute('aria-label', 'Details for ' + it.title);
    pick.addEventListener('click', open);
    // Shown over the image on hover: save it, open the archive's own record,
    // or download the file, without opening the panel first.
    const save = el('button', { type: 'button', className: 'ov save' });
    const paint = () => { const on = saved.has(it.id); save.classList.toggle('on', on); save.textContent = on ? 'Saved' : 'Save'; save.setAttribute('aria-pressed', String(on)); };
    paint();
    save.addEventListener('click', () => { toggleSaved(it); paint(); });
    const out = el('a', { className: 'ov open', href: it.link, target: '_blank', rel: 'noopener', textContent: 'Open ↗' });
    out.setAttribute('aria-label', 'Open the original record for ' + it.title);
    const dl = el('a', { className: 'ov dl', href: downloadLink(it), innerHTML: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.8 7.2 8 10.4l3.2-3.2M3 13.5h10"/></svg>' });
    dl.setAttribute('aria-label', 'Download ' + it.title);
    const cap = el('div', { className: 'cap2' }, [
      el('span', { className: 't', textContent: it.title }),
      el('span', { className: 'm', textContent: it.source + (it.date ? ' / ' + it.date : '') }),
    ]);
    cap.addEventListener('click', open);
    const card = el('div', { className: 'card' }, [el('div', { className: 'shot' }, [pick, save, it.link ? out : '', dl]), cap]);
    cards.set(it.id, card);
    return card;
  }));
  const again = open && shown.find((it) => it.id === open);
  if (again) showDetail(again, cards.get(again.id)); else if (open) setAddress(null);
  if (state.items.length && !shown.length) { $('msg').hidden = false; $('msg').textContent = 'Nothing matches these filters. Reset them to see all ' + state.items.length + ' results.'; }
  else if (state.items.length) $('msg').hidden = true;
}

function update() { renderFilters(); renderGrid(); renderChips(); }

function goHome() {
  state.items = []; state.q = ''; state.page = 0; state.more = false;
  $('results').hidden = true; $('home').hidden = false; $('q').value = '';
  setAddress(null);
  renderFilters();
  renderChips();
  toTop();
}

// The Met limits how many requests one address may make, and every visitor's
// search leaves our server from the same few addresses. When the server could
// not reach the Met, the visitor's own browser asks it directly and the
// results are merged in, ranked the same way the server ranks them.
const MET = 'https://collectionapi.metmuseum.org/public/collection';
const metJson = (u) => fetch(u, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));
let metRest = 0;
async function metDirect(q, page, n) {
  if (Date.now() < metRest) throw new Error('resting');
  const one = (id) => metJson(MET + '/v1/objects/' + id).catch((e) => { if (/403/.test(e.message)) metRest = Date.now() + 60000; return null; });
  const usable = (o) => o && o.isPublicDomain && o.primaryImageSmall;
  const s = await metJson(MET + '/v1.1/search?hasImages=true&limit=40&offset=' + page * 40 + '&q=' + encodeURIComponent(q));
  const ids = (s.objectIDs || []).slice(0, 36);
  let objs = await Promise.all(ids.slice(0, n + 6).map(one));
  // Many records are not public domain; look further only when few were usable.
  if (objs.filter(usable).length < 8 && ids.length > n + 6 && Date.now() >= metRest) objs = objs.concat(await Promise.all(ids.slice(n + 6).map(one)));
  return objs.filter((o) => o && o.isPublicDomain && o.primaryImageSmall).slice(0, n).map((o) => ({
    id: 'met-' + o.objectID, source: 'The Met', title: o.title || 'Untitled', maker: o.artistDisplayName || '',
    date: o.objectDate || '', type: o.classification || o.objectName || '', thumb: o.primaryImageSmall,
    image: o.primaryImage || o.primaryImageSmall, width: null, height: null, rights: 'CC0',
    link: o.objectURL || 'https://www.metmuseum.org/art/collection/search/' + o.objectID,
  }));
}
function rankMentions(text, q) {
  const hay = String(text || '').toLowerCase();
  const words = String(q || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  return words.every((w) => {
    const bases = [w, w.replace(/s$/, ''), w.replace(/es$/, '')];
    const forms = [...new Set(bases.flatMap((b) => [b, b + 's', b + 'es']))].filter((f) => f.length >= 3).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('\\b(' + forms.join('|') + ')\\b').test(hay);
  });
}
function rankScore(it, q) {
  const t = String(it.type || '').toLowerCase();
  const kind = !t ? 1 : /print|engrav|etch|woodcut|woodblock|lithograph|mezzotint|aquatint|poster|draw|chalk|graphite|charcoal|pastel|watercolor|pen and|ink/.test(t) ? 3 : /paint|oil on|tempera|photo|gelatin|albumen|daguerre/.test(t) ? 1 : 0;
  return (rankMentions(it.title, q) ? 2 : 0) + kind;
}
const plainName = (s) => String(s || '').split('(')[0].normalize('NFD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function mergeMet(items, met, q) {
  const mixed = [];
  let m = 0;
  items.forEach((it, i) => { mixed.push(it); if (i % 5 === 4 && met[m]) mixed.push(met[m++]); });
  while (met[m]) mixed.push(met[m++]);
  const seen = new Set();
  const unique = mixed.filter((it) => {
    const keys = [it.image || it.thumb];
    if (plainName(it.maker)) keys.push(plainName(it.title) + '|' + plainName(it.maker));
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
  return unique.map((it) => ({ it, s: rankScore(it, q) })).sort((a, b) => b.s - a.s).map((x) => x.it);
}

async function fetchPage(q, page) {
  const clean = String(q).toLowerCase().trim().replace(/\s+/g, ' ');
  const r = await fetch(api('/api/search?q=' + encodeURIComponent(clean) + (page ? '&page=' + page : '')));
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Search failed');
  const metSrc = (data.sources || []).find((s) => s.name === 'The Met');
  if (metSrc && !metSrc.ok) {
    try {
      const met = await metDirect(clean, page || 0, 12);
      data.items = mergeMet(data.items || [], met, clean);
      metSrc.ok = true; metSrc.count = met.length; delete metSrc.error;
      if (met.length) data.more = true;
    } catch (e) { /* the other archives still answer */ }
  }
  return data;
}

async function run(q, label, openId) {
  state.q = q; state.items = []; state.page = 0; state.more = false;
  $('q').value = q;
  setAddress(openId || null);
  $('home').hidden = true; $('results').hidden = false;
  $('rt').textContent = label || q;
  $('status').textContent = '';
  $('msg').hidden = false; $('msg').textContent = 'Searching the archives';
  $('grid').replaceChildren(); $('detail').hidden = true; $('more').hidden = true;
  renderFilters();
  renderChips();
  try {
    const data = await fetchPage(q, 0);
    if (state.q !== q) return;
    state.items = data.items || [];
    state.more = Boolean(data.more);
    if (!state.items.length) { $('msg').textContent = 'Nothing public domain came back for that. Try a broader word.'; renderFilters(); return; }
    update();
    const down = (data.sources || []).filter((s) => !s.ok).map((s) => s.name);
    if (down.length) $('status').textContent += ' / ' + down.join(', ') + ' did not respond';
  } catch (e) {
    $('msg').hidden = false; $('msg').textContent = 'The search did not go through. Try again in a moment.';
  }
}

// The next batch from every archive, added under what is already showing.
async function loadMore() {
  const q = state.q;
  const btn = $('more');
  btn.disabled = true; btn.textContent = 'Loading';
  try {
    const data = await fetchPage(q, state.page + 1);
    if (state.q !== q) return;
    const have = new Set(state.items.map((it) => it.id));
    const fresh = (data.items || []).filter((it) => !have.has(it.id));
    state.page += 1;
    state.more = Boolean(data.more) && fresh.length > 0;
    state.items.push(...fresh);
    const at = window.scrollY;
    update();
    window.scrollTo({ top: at });
  } catch (e) {
    $('status').textContent = 'More results did not load. Try again in a moment.';
  } finally {
    btn.disabled = false; btn.textContent = 'Load more';
  }
}

function crateCard(c) {
  const spares = c.items.slice();
  const cells = [];
  for (let i = 0; i < 4; i++) {
    const cell = el('span', { className: 'cell' });
    // If an image fails, swap in a spare; with none left, leave the empty tile.
    const fill = () => {
      const it = spares.shift();
      if (it) cell.replaceChildren(thumb(it, 192, { loading: 'lazy', decoding: 'async' }, fill)); else cell.replaceChildren();
    };
    fill();
    cells.push(cell);
  }
  const a = el('a', { className: 'crate', href: '?q=' + encodeURIComponent(c.q) }, [
    el('span', { className: 'quad' }, cells),
    el('span', { className: 'cap' }, [el('span', { textContent: c.label }), el('span', { textContent: '→' })]),
  ]);
  a.setAttribute('aria-label', 'Browse ' + c.label);
  a.addEventListener('click', (e) => { e.preventDefault(); run(c.q, c.label); toTop(); });
  return a;
}

const skeleton = () => el('div', { className: 'crate' }, [
  el('span', { className: 'quad' }, Array.from({ length: 4 }, () => el('span', { className: 'cell' }))),
  el('span', { className: 'cap' }, [el('span', { textContent: 'Loading' }), el('span')]),
]);

async function loadHome() {
  const box = $('crates');
  box.replaceChildren(...Array.from({ length: 8 }, skeleton));
  try {
    const r = await fetch(api('/api/home'));
    const data = await r.json();
    if (!r.ok || !data.crates || !data.crates.length) throw new Error('no crates');
    box.replaceChildren(...data.crates.map(crateCard));
  } catch (e) {
    box.replaceChildren(el('div', { className: 'msg', textContent: 'The crates did not load. Search still works.' }));
  }
}

$('f').addEventListener('submit', (e) => { e.preventDefault(); const q = $('q').value.trim(); if (q) run(q); });
$('back').addEventListener('click', goHome);
$('more').addEventListener('click', loadMore);
$('saved').addEventListener('click', showSaved);
paintSavedCount();
$('view').addEventListener('click', () => setWall(!gfxRoot.classList.contains('wall')));
try { if (localStorage.getItem('gfxp-wall') === '1') setWall(true); } catch (e) { /* default view */ }
$('reset').addEventListener('click', () => { state.offArchives.clear(); state.types.clear(); state.printReady = false; update(); });
// On a phone the filter panel starts folded so the crates are visible first.
if (window.matchMedia('(max-width: 860px)').matches) $('filters').open = false;
renderFilters();
loadHome();
loadChips();
const startParams = new URLSearchParams(location.search);
const start = startParams.get('q');
if (start) run(start, null, startParams.get('i'));
})();
