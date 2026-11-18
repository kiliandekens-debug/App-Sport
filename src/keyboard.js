// iOS keeps position: fixed elements on the layout viewport, so the session dock
// (Valider, rest timer) ends up hidden behind the on-screen keyboard. This tracks
// the keyboard height through visualViewport and exposes it as --kb; the CSS lifts
// the docks above the keyboard and adds room so the page can scroll to its end.
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  const update = () => {
    raf = 0;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = kb > 120; // ignore the toolbar wobble of Safari's address bar
    root.style.setProperty('--kb', `${open ? kb : 0}px`);
    document.body.classList.toggle('kb-open', open);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);

  // Once the keyboard is up, keep the focused field clear of the lifted dock.
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.closest('main')) return;
    setTimeout(() => {
      if (document.activeElement !== el || !document.body.classList.contains('kb-open')) return;
      const dock = document.querySelector('.dock, .glass-dock');
      const bottom = vv.offsetTop + vv.height - (dock ? dock.getBoundingClientRect().height : 0) - 16;
      const r = el.getBoundingClientRect();
      if (r.bottom > bottom) window.scrollBy({ top: r.bottom - bottom, behavior: 'smooth' });
    }, 350);
  });
}
