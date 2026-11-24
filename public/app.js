// GFXWRLD Public: home crates, search, and the left-hand filter panel.
(() => {
// The same files run the standalone site and the page on gfxwrld.com. A host
// page only needs an element marked data-gfx-app inside a .gfxp wrapper; the
// markup below is placed into it, and every request goes back to the site
// these scripts were loaded from.
const GFX_ORIGIN = document.currentScript ? new URL(document.currentScript.src).origin : '';
const GFX_MARKUP = `
  <section class="panel" aria-label="Search">
    <div class="ph"><i></i>ARCHIVE_SEARCH @ 100%</div>
    <form id="f">
      <label for="q" class="sr">Search the archives</label>
      <input id="q" type="search" placeholder="Skull, eagle, boxing" autocomplete="off">
      <button class="go" type="submit">Search<span aria-hidden="true">&rarr;</span></button>
    </form>
  </section>

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
        <div class="bar"><h2 id="rt"></h2><button type="button" class="btn g small" id="back">&larr;&nbsp; All crates</button></div>
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

const ARCHIVES = ['The Met', 'Art Institute of Chicago', 'Cleveland Museum of Art', 'Europeana', 'Wikimedia Commons'];
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
const proxied = (u) => api('/api/img?u=' + encodeURIComponent(u));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
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

function showDetail(it, card) {
  document.querySelectorAll('.gfxp .card').forEach((c) => c.setAttribute('aria-pressed', c === card ? 'true' : 'false'));
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
  const dl = el('a', { className: 'btn p', href: proxied(it.image) + '&dl=1&name=' + encodeURIComponent('gfxwrld-' + (slug(it.title) || it.id)), textContent: 'Download image' });
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
    const img = el('img', { src: it.thumb, alt: '', loading: 'lazy' });
    const card = el('button', { type: 'button', className: 'card' }, [
      img,
      el('span', { className: 't', textContent: it.title }),
      el('span', { className: 'm', textContent: it.source + (it.date ? ' / ' + it.date : '') }),
    ]);
    // A result whose image will not load is no use to anyone: drop the card.
    img.addEventListener('error', () => card.remove());
    card.setAttribute('aria-pressed', 'false');
    card.addEventListener('click', () => showDetail(it, card));
    cards.set(it.id, card);
    return card;
  }));
  const again = open && shown.find((it) => it.id === open);
  if (again) showDetail(again, cards.get(again.id)); else if (open) setAddress(null);
  if (state.items.length && !shown.length) { $('msg').hidden = false; $('msg').textContent = 'Nothing matches these filters. Reset them to see all ' + state.items.length + ' results.'; }
  else if (state.items.length) $('msg').hidden = true;
}

function update() { renderFilters(); renderGrid(); }

function goHome() {
  state.items = []; state.q = ''; state.page = 0; state.more = false;
  $('results').hidden = true; $('home').hidden = false; $('q').value = '';
  setAddress(null);
  renderFilters();
  toTop();
}

async function fetchPage(q, page) {
  const r = await fetch(api('/api/search?q=' + encodeURIComponent(q) + (page ? '&page=' + page : '')));
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Search failed');
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
    const it = spares.shift();
    if (it) {
      const img = el('img', { alt: '', src: it.thumb });
      // If an image fails, swap in a spare; with none left, leave the empty tile.
      img.addEventListener('error', () => { const next = spares.shift(); if (next) img.src = next.thumb; else img.remove(); });
      cell.append(img);
    }
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
$('reset').addEventListener('click', () => { state.offArchives.clear(); state.types.clear(); state.printReady = false; update(); });
// On a phone the filter panel starts folded so the crates are visible first.
if (window.matchMedia('(max-width: 860px)').matches) $('filters').open = false;
renderFilters();
loadHome();
const startParams = new URLSearchParams(location.search);
const start = startParams.get('q');
if (start) run(start, null, startParams.get('i'));
})();
