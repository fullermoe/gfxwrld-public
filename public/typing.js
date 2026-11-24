// Search box placeholder that types example searches one at a time, on a loop.
// It stops while the box is focused so it never competes with the person typing.
(() => {
  const input = document.getElementById('q');
  if (!input) return;
  const WORDS = ['Skull', 'Eagle', 'Boxing', 'Vintage ad', 'Devil', 'Florals'];
  const TYPE_MS = 95;
  const DELETE_MS = 45;
  const HOLD_MS = 1500;
  const GAP_MS = 350;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    input.placeholder = WORDS.slice(0, 3).join(', ');
    return;
  }

  let word = 0;
  let chars = 0;
  let dir = 1;
  let timer = null;

  function tick() {
    const text = WORDS[word];
    chars += dir;
    input.placeholder = text.slice(0, chars) + '_';
    let wait = dir > 0 ? TYPE_MS : DELETE_MS;
    if (dir > 0 && chars === text.length) { dir = -1; wait = HOLD_MS; }
    else if (dir < 0 && chars === 0) { dir = 1; word = (word + 1) % WORDS.length; wait = GAP_MS; }
    timer = setTimeout(tick, wait);
  }
  function start() {
    if (timer) return;
    timer = setTimeout(tick, GAP_MS);
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  input.addEventListener('focus', () => { stop(); input.placeholder = 'Type anything'; });
  input.addEventListener('blur', () => { chars = 0; dir = 1; input.placeholder = '_'; start(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (document.activeElement !== input) start();
  });

  input.placeholder = '_';
  start();
})();
