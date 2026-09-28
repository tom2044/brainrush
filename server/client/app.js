'use strict';

const ROLE_KEY = 'brainrush:role';
const TEAM_KEY = 'brainrush:teamid';

const App = {
  role: null,
  adminSlots: { total: 2, active: 0, available: 2 },

  boot() {
    Socket.init();
    try { this.role = sessionStorage.getItem(ROLE_KEY); } catch (e) {}

    Socket.on('connect', () => {
      this.updateConnBadge(true);
      Socket.emit('admin:slots:get');
      this.reattach();
    });
    Socket.on('disconnect', () => this.updateConnBadge(false));
    Socket.on('state', (s) => {
      if (this.role === 'admin') Admin.setState(s);
      else if (this.role === 'team') Team.setState(s);
    });
    Socket.on('admin:slots', (data) => {
      App.adminSlots = data;
      if (!App.role) render();
    });

    this.updateConnBadge(false);
    render();
  },

  reattach() {
    if (this.role === 'admin') {
      let token = null;
      try { token = sessionStorage.getItem('brainrush:adminToken'); } catch (e) {}
      if (token) Socket.emit('role:admin', { token });
      render();
    } else if (this.role === 'team') {
      let teamId = null;
      try { teamId = sessionStorage.getItem(TEAM_KEY); } catch (e) {}
      Socket.emit('role:team', { teamId });
    }
  },

  setRole(r) {
    this.role = r;
    try { sessionStorage.setItem(ROLE_KEY, r); } catch (e) {}
    if (r === 'admin') {
      const savedToken = (() => {
        try { return sessionStorage.getItem('brainrush:adminToken'); }
        catch (e) { return null; }
      })();
      if (savedToken) Socket.emit('role:admin', { token: savedToken });
      // else: Admin.render will show the login screen
    } else if (r === 'team') {
      let teamId = null;
      try { teamId = sessionStorage.getItem(TEAM_KEY); } catch (e) {}
      Socket.emit('role:team', { teamId });
    }
    render();
  },

  exitRole() {
    try {
      sessionStorage.removeItem(ROLE_KEY);
      sessionStorage.removeItem('brainrush:adminToken');
      sessionStorage.removeItem('brainrush:adminId');
      sessionStorage.removeItem('brainrush:adminName');
      sessionStorage.removeItem('brainrush:adminMobile');
    } catch (e) {}
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

function renderRoles(root) {
  const slots = App.adminSlots;
  const adminAvailable = slots.available > 0;

  root.innerHTML = `
    <div class="role-screen">
      <div class="role-header">
        <h2>CHOOSE YOUR ROLE</h2>
        <p>Select how you want to enter the arena</p>
      </div>
      <div class="role-grid">
        ${adminAvailable ? `
        <div class="role-card" id="rcAdmin">
          <div class="rc-ico">🛡️</div>
          <h3>Admin</h3>
          <p>Login with mobile OTP. ${slots.available} slot${slots.available === 1 ? '' : 's'} available.</p>
        </div>
        ` : `
        <div class="role-card" style="opacity:.45;cursor:not-allowed;filter:grayscale(.6)">
          <div class="rc-ico">🛡️</div>
          <h3>Admin — FULL</h3>
          <p>Both admin slots are in use. Team entry only.</p>
        </div>
        `}
        <div class="role-card" id="rcTeam">
          <div class="rc-ico">🎓</div>
          <h3>Team</h3>
          <p>Two students, one device. Register, answer fast, buzz first.</p>
        </div>
      </div>
      <button class="back-btn" id="backBtn">← BACK TO WELCOME</button>
    </div>`;

  const rcAdmin = document.getElementById('rcAdmin');
  if (rcAdmin) rcAdmin.onclick = () => {
    if (App.adminSlots.available > 0) App.setRole('admin');
    else toast('⚠ Both admin slots are full');
  };
  document.getElementById('rcTeam').onclick = () => App.setRole('team');
  document.getElementById('backBtn').onclick = () => renderWelcome(root);
}

try {
  App.boot();
} catch (e) {
  console.error('Boot failed:', e);
  document.body.innerHTML =
    `<div style="padding:40px;color:#ff4d6d;font-family:monospace">Boot error: ${esc(e.message)}</div>`;
}

window.BRAINRUSH = App;