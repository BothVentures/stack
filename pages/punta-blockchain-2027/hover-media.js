/* ══════════════════════════════════════════════════════════
   RICK'S STUDIO · LIBRARY RESOURCE
   hover-media v1.0 — cursor-following media reveal
   ──────────────────────────────────────────────────────────
   Rollover a marked word → an image or short video floats
   beside the cursor, lerp-follows it with a touch of inertia
   tilt, and wipes away on exit. Touch devices: tap toggles a
   centered lightbox.

   MARKUP (simplest — inline source):
     <span data-hm-src="img/maca.jpg" data-hm-caption="MACA · Atchugarry">MACA</span>

   MARKUP (registry — keep sources in one place):
     <span data-hm="maca">MACA</span>
     <script>
       HoverMedia.register({
         maca: { src: 'img/maca.jpg', caption: 'MACA · Atchugarry' },
         party: { src: 'video/party.mp4' },         // .mp4/.webm/.mov → video
         reel:  { seq: ['a.jpg','b.jpg'], interval: 350 } // flash slideshow
       });
       HoverMedia.init();                            // call after register
     </script>

   Video: muted, looped, autoplays on reveal, pauses on hide.
   Size: tune with CSS vars --hm-width / --hm-ratio (defaults
   ≈ one-sixth of viewport area).
   Auto-inits on DOMContentLoaded; re-call HoverMedia.init()
   after injecting new triggers.
   ══════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;
  const registry = Object.create(null);
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let frame = null, mediaEl = null, captionEl = null;
  let seqTimer = null;            // slideshow interval for seq entries
  let active = null;              // trigger element currently showing
  let mx = 0, my = 0;             // raw mouse
  let fx = 0, fy = 0;             // lerped frame position
  let vx = 0;                     // x-velocity → tilt
  let raf = null, hideTimer = null;

  /* ── frame lifecycle ─────────────────────────────────── */
  function ensureFrame() {
    if (frame) return;
    frame = document.createElement('div');
    frame.className = 'hm-frame';
    frame.setAttribute('aria-hidden', 'true');
    captionEl = document.createElement('div');
    captionEl.className = 'hm-caption';
    frame.appendChild(captionEl);
    document.body.appendChild(frame);
  }

  function setMedia(src, caption) {
    if (mediaEl) mediaEl.remove();
    if (VIDEO_RE.test(src)) {
      mediaEl = document.createElement('video');
      mediaEl.muted = true;
      mediaEl.loop = true;
      mediaEl.playsInline = true;
      mediaEl.autoplay = true;
      mediaEl.src = src;
    } else {
      mediaEl = document.createElement('img');
      mediaEl.alt = caption || '';
      mediaEl.src = src;
    }
    frame.insertBefore(mediaEl, captionEl);
    captionEl.textContent = caption || '';
    captionEl.style.display = caption ? '' : 'none';
  }

  /* ── positioning ─────────────────────────────────────── */
  function place() {
    const w = frame.offsetWidth, h = frame.offsetHeight;
    const pad = 24;
    // prefer right of cursor, flip when near the edge
    let tx = fx + pad;
    if (tx + w > innerWidth - 12) tx = fx - w - pad;
    let ty = fy - h * 0.5;
    ty = Math.max(12, Math.min(ty, innerHeight - h - 12));
    const tilt = reduceMotion ? 0 : Math.max(-6, Math.min(6, vx * 0.35));
    frame.style.transform =
      'translate3d(' + tx + 'px,' + ty + 'px,0) rotate(' + tilt + 'deg)' +
      (frame.classList.contains('hm-on') ? '' : ' scale(0.96)');
  }

  function tick() {
    const ease = reduceMotion ? 1 : 0.14;
    const pfx = fx;
    fx += (mx - fx) * ease;
    fy += (my - fy) * ease;
    vx = fx - pfx;
    place();
    raf = requestAnimationFrame(tick);
  }

  /* ── show / hide ─────────────────────────────────────── */
  function startSeq(seq, interval) {
    clearInterval(seqTimer);
    let i = 0;
    // preload the set once so the flash never stutters
    seq.forEach(function (s) { const im = new Image(); im.src = s; });
    seqTimer = setInterval(function () {
      i = (i + 1) % seq.length;
      if (mediaEl) mediaEl.src = seq[i];
    }, interval || 350);
  }

  function show(trigger) {
    ensureFrame();
    clearTimeout(hideTimer);
    const src = trigger.__hmSeq ? trigger.__hmSeq[0] : trigger.__hmSrc,
          cap = trigger.__hmCaption;
    if (!src) return;
    if (active !== trigger) {
      setMedia(src, cap);
      if (trigger.__hmSeq) startSeq(trigger.__hmSeq, trigger.__hmInterval);
      else clearInterval(seqTimer);
    }
    active = trigger;

    if (isTouch) {
      frame.style.transform = 'translate3d(-50%,-50%,0)';
    } else {
      fx = mx; fy = my; place();
    }
    frame.classList.remove('hm-off');
    // force reflow so the enter transition always replays
    void frame.offsetWidth;
    frame.classList.add('hm-on');
    if (mediaEl && mediaEl.tagName === 'VIDEO') mediaEl.play().catch(function () {});
    if (!isTouch && !raf) raf = requestAnimationFrame(tick);
  }

  function hide() {
    if (!frame || !active) return;
    active = null;
    frame.classList.remove('hm-on');
    frame.classList.add('hm-off');
    if (mediaEl && mediaEl.tagName === 'VIDEO') mediaEl.pause();
    hideTimer = setTimeout(function () {
      clearInterval(seqTimer);
      if (!active && raf) { cancelAnimationFrame(raf); raf = null; }
    }, 450);
  }

  /* ── wiring ──────────────────────────────────────────── */
  function resolve(el) {
    const key = el.getAttribute('data-hm');
    const entry = key ? registry[key] : null;
    el.__hmSrc = el.getAttribute('data-hm-src') || (entry && entry.src) || null;
    el.__hmSeq = (entry && entry.seq && entry.seq.length) ? entry.seq : null;
    el.__hmInterval = (entry && entry.interval) || null;
    el.__hmCaption = el.getAttribute('data-hm-caption') || (entry && entry.caption) || '';
    return !!(el.__hmSrc || el.__hmSeq);
  }

  function bind(el) {
    if (el.__hmBound) { resolve(el); return; }
    el.__hmBound = true;
    if (!resolve(el)) return;
    el.classList.add('hm-trigger');

    if (isTouch) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        active === el ? hide() : show(el);
      });
    } else {
      el.addEventListener('mouseenter', function () { show(el); });
      el.addEventListener('mouseleave', hide);
    }
  }

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
  }, { passive: true });

  if (isTouch) {
    document.addEventListener('click', function (e) {
      if (active && !e.target.closest('.hm-trigger')) hide();
    });
  }

  /* ── public API ──────────────────────────────────────── */
  const HoverMedia = {
    register: function (map) { Object.assign(registry, map); return this; },
    init: function (root) {
      (root || document)
        .querySelectorAll('[data-hm],[data-hm-src]')
        .forEach(bind);
      return this;
    },
    hide: hide
  };

  global.HoverMedia = HoverMedia;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { HoverMedia.init(); });
  } else {
    HoverMedia.init();
  }
})(window);
