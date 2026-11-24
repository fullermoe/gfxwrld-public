// Background remover for the result panel.
// It turns a scan into ink on transparency: the paper becomes see-through and
// what was printed on it becomes a single ink colour. All of the work happens in
// the visitor's browser; nothing is uploaded or stored.
// Works best on prints, engravings and drawings. It does not cut a subject out
// of a painting or a photo.
(() => {
  const PREVIEW_MAX = 900;
  const EXPORT_MAX = 4000;
  const INKS = { Black: [0, 0, 0], White: [241, 241, 241], Lime: [220, 239, 111] };
  // The preview backdrop that shows each ink best.
  const BACK_FOR_INK = { Black: 'White', White: 'Black', Lime: 'Black' };
  const el = (tag, props = {}, kids = []) => { const n = Object.assign(document.createElement(tag), props); kids.forEach((k) => n.append(k)); return n; };
  const proxied = (u) => '/api/img?u=' + encodeURIComponent(u);
  let job = 0;

  function load(url, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try { resolve(ctx.getImageData(0, 0, c.width, c.height)); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Image did not load'));
      img.src = proxied(url);
    });
  }

  // Find how bright the paper is and how dark the ink is, so a cream page and
  // a faded print are both stretched to a full paper-to-ink range.
  function levels(d) {
    const hist = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < d.length; i += 16) { hist[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]++; total++; }
    const at = (frac) => { let run = 0; for (let v = 0; v < 256; v++) { run += hist[v]; if (run >= total * frac) return v; } return 255; };
    return { ink: at(0.04), paper: at(0.9) };
  }

  function knock(src, o) {
    const d = src.data;
    const out = new ImageData(src.width, src.height);
    const p = out.data;
    const { ink, paper } = levels(d);
    const range = Math.max(1, paper - ink);
    const cut = o.cutoff / 100;
    const [r, g, b] = INKS[o.ink];
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      let t = (paper - lum) / range;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (o.invert) t = 1 - t;
      const a = o.mode === 'Hard' ? (t > cut ? 1 : 0) : (t <= cut ? 0 : (t - cut) / (1 - cut));
      p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = Math.round(a * (d[i + 3] / 255) * 255);
    }
    return out;
  }

  // A row of pick-one buttons. Returns the element and a way to set it from code.
  function seg(label, values, current, onPick) {
    const row = el('div');
    const buttons = values.map((v) => {
      const b = el('button', { type: 'button', textContent: v });
      b.addEventListener('click', () => { set(v); onPick(v); });
      return b;
    });
    const set = (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === v)));
    set(current);
    buttons.forEach((b) => row.append(b));
    return { node: el('div', { className: 'seg' }, [el('span', { textContent: label }), row]), set };
  }

  function mount(it) {
    const panel = document.getElementById('detail');
    const orig = panel && panel.querySelector('img');
    if (!orig) return;
    const mine = ++job;
    const o = { mode: 'Soft', cutoff: 25, ink: 'Black', back: BACK_FOR_INK.Black, invert: false };
    let src = null;

    const canvas = el('canvas');
    const stage = el('div', { className: 'cutstage', hidden: true }, [canvas]);
    const status = el('p', { className: 'cutstatus' });
    status.setAttribute('aria-live', 'polite');

    const draw = () => {
      stage.dataset.back = o.back;
      if (!src || mine !== job) return;
      const out = knock(src, o);
      canvas.width = out.width; canvas.height = out.height;
      canvas.getContext('2d').putImageData(out, 0, 0);
    };

    const range = el('input', { type: 'range', min: '5', max: '90', value: String(o.cutoff) });
    range.addEventListener('input', () => { o.cutoff = Number(range.value); draw(); });
    const inv = el('input', { type: 'checkbox' });
    inv.addEventListener('change', () => { o.invert = inv.checked; draw(); });
    const save = el('button', { type: 'button', className: 'btn p', textContent: 'Download PNG' });

    save.addEventListener('click', async () => {
      save.disabled = true;
      status.textContent = 'Preparing the full size file';
      let big = src;
      try { big = await load(it.image, EXPORT_MAX); } catch (e) { /* fall back to the preview size */ }
      const out = knock(big, o);
      const c = document.createElement('canvas');
      c.width = out.width; c.height = out.height;
      c.getContext('2d').putImageData(out, 0, 0);
      c.toBlob((blob) => {
        save.disabled = false;
        if (!blob) { status.textContent = 'Could not make the file. Try again.'; return; }
        const a = el('a', { href: URL.createObjectURL(blob), download: 'gfxwrld-' + it.id + '-cut.png' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        status.textContent = 'Saved ' + out.width + ' x ' + out.height + ' px, transparent PNG';
      }, 'image/png');
    });

    const backSeg = seg('Preview on', ['Grid', 'Black', 'White'], o.back, (v) => { o.back = v; draw(); });
    const inkSeg = seg('Ink colour', Object.keys(INKS), o.ink, (v) => { o.ink = v; o.back = BACK_FOR_INK[v]; backSeg.set(o.back); draw(); });
    const tools = el('div', { className: 'cuttools', hidden: true }, [
      seg('Edge', ['Soft', 'Hard'], o.mode, (v) => { o.mode = v; draw(); }).node,
      el('label', { className: 'rng' }, ['How much paper to remove', range]),
      inkSeg.node,
      backSeg.node,
      el('label', { className: 'chk' }, [inv, 'Art is light on dark']),
      save,
      status,
    ]);

    const tabOrig = el('button', { type: 'button', textContent: 'Original' });
    const tabCut = el('button', { type: 'button', textContent: 'Remove background' });
    const show = async (cut) => {
      tabOrig.setAttribute('aria-pressed', String(!cut));
      tabCut.setAttribute('aria-pressed', String(cut));
      orig.hidden = cut; stage.hidden = !cut; tools.hidden = !cut;
      if (!cut || src) { draw(); return; }
      status.textContent = 'Loading the image';
      try {
        src = await load(it.thumb, PREVIEW_MAX);
        status.textContent = '';
        draw();
      } catch (e) {
        status.textContent = 'This image cannot be processed here. Use Open full image instead.';
        save.disabled = true;
      }
    };
    tabOrig.addEventListener('click', () => show(false));
    tabCut.addEventListener('click', () => show(true));
    tabOrig.setAttribute('aria-pressed', 'true');
    tabCut.setAttribute('aria-pressed', 'false');

    orig.before(el('div', { className: 'cuttabs' }, [tabOrig, tabCut]));
    orig.after(stage, tools);
  }

  document.addEventListener('gfx:detail', (e) => mount(e.detail.item));
})();
