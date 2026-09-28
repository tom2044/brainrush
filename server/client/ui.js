'use strict';

/* ============================================================
   BRAINRUSH — UI Utilities
   ============================================================ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const now = () => Date.now();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

const fmtClock = (s) => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return m + ':' + ss;
};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s, transform .4s';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 20px) scale(.9)';
  }, 1600);
  setTimeout(() => el.remove(), 2100);
}

/* ============================================================
   GLOBAL ERROR BANNER
   ============================================================ */
window.addEventListener('error', (e) => {
  const div = document.createElement('div');
  div.className = 'err';
  div.textContent = '⚠ ERROR: ' + (e.message || e.error) +
    '\n' + (e.filename || '') + ':' + (e.lineno || '');
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 8000);
});

/* ============================================================
   PARTICLE FIELD
   ============================================================ */
(function makeParticles() {
  const host = document.getElementById('particles');
  if (!host) return;
  const count = window.innerWidth < 640 ? 14 : 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDuration = (14 + Math.random() * 22) + 's';
    p.style.animationDelay = (-Math.random() * 36) + 's';
    const size = 2 + Math.random() * 2.5;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    if (Math.random() > 0.55) {
      p.style.background = 'var(--copper)';
      p.style.boxShadow = '0 0 10px rgba(196,122,63,.9)';
    } else if (Math.random() > 0.5) {
      p.style.background = 'var(--copper-light)';
      p.style.boxShadow = '0 0 12px rgba(232,154,92,1)';
    }
    host.appendChild(p);
  }
})();

/* ============================================================
   CURSOR-FOLLOW GLOW for elements with .role-card, .opt, .feature
   ============================================================ */
document.addEventListener('pointermove', (e) => {
  const targets = e.target.closest('.role-card, .opt, .feature, .btn.primary');
  if (!targets) return;
  const r = targets.getBoundingClientRect();
  targets.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  targets.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });

/* ============================================================
   PREVENT PINCH ZOOM ON INPUTS (iOS)
   ============================================================ */
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ============================================================
   PAUSE ANIMATIONS WHEN TAB HIDDEN (battery saver)
   ============================================================ */
document.addEventListener('visibilitychange', () => {
  const state = document.hidden ? 'paused' : 'running';
  document.querySelectorAll('.particle').forEach(p => {
    p.style.animationPlayState = state;
  });
});