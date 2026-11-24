// GFXWRLD Public: home crates, search, and the left-hand filter panel.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, kids = []) => { const n = Object.assign(document.createElement(tag), props); kids.forEach((k) => n.append(k)); return n; };

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

const state = { items: [], q: '', offArchives: new Set(), types: new Set(), printReady: false };
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
  document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', c === card ? 'true' : 'false'));
  const size = it.width && it.height ? it.width + ' x ' + it.height + ' px' : 'See source';
  const rows = [['Source', it.via ? it.via + ' via ' + it.source : it.source], ['Maker', it.maker || 'Unknown'], ['Date', it.date || 'Unknown'], ['Type', it.type || 'Not labelled'], ['Rights', it.rights === 'CC0' ? 'CC0 / public domain' : 'Public domain'], ['Size', size]];
  const img = el('img', { src: it.thumb, alt: it.title });
  img.addEventListener('error', () => img.remove());
  $('detail').replaceChildren(
    el('div', { className: 'ph' }, [el('i'), it.id.toUpperCase().slice(0, 24) + ' @ 100%']),
    img,
    el('h3', { textContent: it.title }),
    ...rows.map(([k, v]) => el('div', { className: 'row' }, [el('span', { textContent: k }), el('span', { textContent: v })])),
    el('div', { className: 'acts' }, [
      el('a', { className: 'btn p', href: it.image, target: '_blank', rel: 'noopener', textContent: 'Open full image' }),
      el('a', { className: 'btn g', href: it.link, target: '_blank', rel: 'noopener', textContent: 'View original record' }),
      el('p', { className: 'note', textContent: 'Public domain covers copyright only. Trademarks, logos and a real person\'s likeness can still need permission. Check before you print.' }),
    ])
  );
  $('detail').hidden = false;
  // Lets add-ons such as the background remover attach to the open panel.
  document.dispatchEvent(new CustomEvent('gfx:detail', { detail: { item: it } }));
}

function renderGrid() {
  if ($('results').hidden) return;
  const shown = state.items.filter(passes);
  $('detail').hidden = true;
  $('status').textContent = state.items.length ? shown.length + ' of ' + state.items.length + ' shown / public domain only' : '';
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
    return card;
  }));
  if (state.items.length && !shown.length) { $('msg').hidden = false; $('msg').textContent = 'Nothing matches these filters. Reset them to see all ' + state.items.length + ' results.'; }
  else if (state.items.length) $('msg').hidden = true;
}

function update() { renderFilters(); renderGrid(); }

function goHome() {
  state.items = []; state.q = '';
  $('results').hidden = true; $('home').hidden = false; $('q').value = '';
  history.replaceState(null, '', location.pathname);
  renderFilters();
  window.scrollTo({ top: 0 });
}

async function run(q, label) {
  state.q = q; state.items = [];
  $('q').value = q;
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  $('home').hidden = true; $('results').hidden = false;
  $('rt').textContent = label || q;
  $('status').textContent = '';
  $('msg').hidden = false; $('msg').textContent = 'Searching the archives';
  $('grid').replaceChildren(); $('detail').hidden = true;
  renderFilters();
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Search failed');
    if (state.q !== q) return;
    state.items = data.items || [];
    if (!state.items.length) { $('msg').textContent = 'Nothing public domain came back for that. Try a broader word.'; renderFilters(); return; }
    update();
    const down = (data.sources || []).filter((s) => !s.ok).map((s) => s.name);
    if (down.length) $('status').textContent += ' / ' + down.join(', ') + ' did not respond';
  } catch (e) {
    $('msg').hidden = false; $('msg').textContent = 'The search did not go through. Try again in a moment.';
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
  a.addEventListener('click', (e) => { e.preventDefault(); run(c.q, c.label); window.scrollTo({ top: 0 }); });
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
    const r = await fetch('/api/home');
    const data = await r.json();
    if (!r.ok || !data.crates || !data.crates.length) throw new Error('no crates');
    box.replaceChildren(...data.crates.map(crateCard));
  } catch (e) {
    box.replaceChildren(el('div', { className: 'msg', textContent: 'The crates did not load. Search still works.' }));
  }
}

$('f').addEventListener('submit', (e) => { e.preventDefault(); const q = $('q').value.trim(); if (q) run(q); });
$('back').addEventListener('click', goHome);
$('reset').addEventListener('click', () => { state.offArchives.clear(); state.types.clear(); state.printReady = false; update(); });
// On a phone the filter panel starts folded so the crates are visible first.
if (window.matchMedia('(max-width: 860px)').matches) $('filters').open = false;
renderFilters();
loadHome();
const start = new URLSearchParams(location.search).get('q');
if (start) run(start);
