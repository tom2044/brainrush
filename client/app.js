'use strict';

/* ============================================================
   BRAINRUSH — App Router
   ============================================================ */

const ROLE_KEY = 'brainrush:role';
const TEAM_KEY = 'brainrush:teamid';

const App = {
  role: null,

  boot() {
    Socket.init();
    try { this.role = sessionStorage.getItem(ROLE_KEY); } catch (e) {}

    Socket.on('connect', () => { this.updateConnBadge(true); this.reattach(); });
    Socket.on('disconnect', () => { this.updateConnBadge(false); });
    Socket.on('state', (s) => {
      if (this.role === 'admin') Admin.setState(s);
      else if (this.role === 'team') Team.setState(s);
    });

    this.updateConnBadge(false);
    render();
  },

  reattach() {
    if (this.role === 'admin') Socket.emit('role:admin');
    else if (this.role === 'team') {
      let teamId = null;
      try { teamId = sessionStorage.getItem(TEAM_KEY); } catch (e) {}
      Socket.emit('role:team', { teamId });
    }
  },

  setRole(r) {
    this.role = r;
    try { sessionStorage.setItem(ROLE_KEY, r); } catch (e) {}
    if (r === 'admin') Socket.emit('role:admin');
    else if (r === 'team') {
      let teamId = null;
      try { teamId = sessionStorage.getItem(TEAM_KEY); } catch (e) {}
      Socket.emit('role:team', { teamId });
    }
    render();
  },

  exitRole() {
    try { sessionStorage.removeItem(ROLE_KEY); } catch (e) {}
    location.reload();
  },

  updateConnBadge(on) {
    let el = document.getElementById('connBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'connBadge';
      el.className = 'conn';
      document.body.appendChild(el);
    }
    el.className = 'conn ' + (on ? 'on' : 'off');
    el.textContent = on ? '● ONLINE' : '● OFFLINE';
  }
};

function render() {
  const root = document.getElementById('root');
  if (!root) return;
  try {
    if (!App.role) return renderWelcome(root);
    if (App.role === 'admin') return Admin.render(root);
    return Team.render(root);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div style="padding:40px;color:#ff4d6d">Error: ${esc(e.message)}</div>`;
  }
}

/* ============================================================
   WELCOME / LANDING
   ============================================================ */
function renderWelcome(root) {
  root.innerHTML = `
    <div class="landing">
      <div class="induction-tag">Student Induction Programme · 2026</div>
      <div class="logo">
        <h1>BRAINRUSH</h1>
        <div class="logo-bar"></div>
      </div>
      <p class="tagline">
        Welcome, future <span class="accent">Mechanical Engineers</span>.<br>
        Four rounds. Ten teams. One champion.
      </p>
      <div class="meta-chips">
        <span class="chip"><span class="ico">⚙️</span> 4 ROUNDS</span>
        <span class="chip"><span class="ico">🏆</span> 10 TEAMS</span>
        <span class="chip"><span class="ico">⚡</span> REAL-TIME</span>
        <span class="chip"><span class="ico">🎯</span> BUZZER</span>
      </div>
      <div class="cta-wrap">
        <button class="cta" id="enterBtn">ENTER THE ARENA <span class="arrow">→</span></button>
      </div>
      <div class="features">
        <div class="feature">
          <span class="ico">🔧</span>
          <div><div class="ttl">Mechanical Mind</div><div class="desc">Precision, logic &amp; grit</div></div>
        </div>
        <div class="feature">
          <span class="ico">⚙️</span>
          <div><div class="ttl">Four Rounds</div><div class="desc">Guess · Speed · Challenge · Buzzer</div></div>
        </div>
        <div class="feature">
          <span class="ico">🏅</span>
          <div><div class="ttl">Glory Awaits</div><div class="desc">Trophies, prizes &amp; pride</div></div>
        </div>
      </div>
      <div class="foot">Organized by <span class="org">Department of Mechanical Engineering</span></div>
    </div>`;

  document.getElementById('enterBtn').addEventListener('click', () => renderRoles(root));
}

/* ============================================================
   ROLE SELECTION
   ============================================================ */
function renderRoles(root) {
  root.innerHTML = `
    <div class="role-screen">
      <div class="role-header">
        <h2>CHOOSE YOUR ROLE</h2>
        <p>Select how you want to enter the arena</p>
      </div>
      <div class="role-grid">
        <div class="role-card" id="rcAdmin">
          <div class="rc-ico">🛡️</div>
          <h3>Admin</h3>
          <p>Run the show. Approve teams, control rounds, manage questions.</p>
        </div>
        <div class="role-card" id="rcTeam">
          <div class="rc-ico">🎓</div>
          <h3>Team</h3>
          <p>Two students, one device. Register, answer fast, buzz first.</p>
        </div>
      </div>
      <button class="back-btn" id="backBtn">← BACK TO WELCOME</button>
    </div>`;

  document.getElementById('rcAdmin').onclick = () => App.setRole('admin');
  document.getElementById('rcTeam').onclick  = () => App.setRole('team');
  document.getElementById('backBtn').onclick = () => renderWelcome(root);
}

/* ============================================================
   BOOT
   ============================================================ */
try {
  App.boot();
} catch (e) {
  console.error('Boot failed:', e);
  document.body.innerHTML =
    `<div style="padding:40px;color:#ff4d6d;font-family:monospace">Boot error: ${esc(e.message)}</div>`;
}

window.BRAINRUSH = App;