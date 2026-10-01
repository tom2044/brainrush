'use strict';

/* ============================================================
   BRAINRUSH — Projector View (admin-only, view-only)
   ============================================================ */

const Projector = {
  socket: null,
  state: null,
  token: null,
  frozen: false,

  boot() {
    const params = new URLSearchParams(location.search);
    this.token = params.get('token');

    if (!this.token) {
      this.renderDenied('No access token provided');
      return;
    }

    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity
    });

    this.socket.on('connect', () => {
      this.frozen = false;
      this.socket.emit('role:projector', { token: this.token });
    });

    this.socket.on('state', (s) => {
      if (this.frozen) return;
      this.state = s;
      this.render();
    });

    this.socket.on('projector:denied', () => {
      this.frozen = true;
      this.renderDenied('Access denied — admin session not valid');
    });

    this.socket.on('disconnect', () => {
      this.frozen = true;
    });
  },

  renderDenied(msg) {
    document.getElementById('projector').innerHTML = `
      <div class="proj-screen proj-center">
        <div style="font-size:120px">🚫</div>
        <h1 class="proj-huge-title">ACCESS DENIED</h1>
        <p class="proj-subtitle">${esc(msg)}</p>
        <p class="proj-subtitle-small">Open from admin panel → 🖥 OPEN PROJECTOR</p>
      </div>`;
  },

  render() {
    const root = document.getElementById('projector');
    if (!this.state) {
      root.innerHTML = `<div class="proj-screen proj-center"><h1 class="proj-huge-title">BRAINRUSH</h1></div>`;
      return;
    }
    const s = this.state.session;

    if (s.state === 'LOBBY' || s.state === 'INSTRUCTIONS' || s.state === 'SELECTION') {
      return this.renderGiantLogo(root);
    }
    if (s.state === 'ROUND_END' && s.round === 0) {
      return this.renderQualifiers(root);
    }
    if (s.state === 'ROUND_END' && s.round >= 1 && s.round <= 4) {
      return this.renderRoundEnd(root);
    }
    if (s.state === 'ROUND_INTRO' && s.round >= 1) {
      return this.renderRoundIntro(root);
    }
    if (s.state === 'QUESTION_ACTIVE' && s.round >= 1) {
      return this.renderActive(root);
    }
    if (s.state === 'QUESTION_REVEAL' && s.round >= 1) {
      return this.renderReveal(root);
    }
    if (s.state === 'FINISHED') {
      return this.renderFinished(root);
    }
    return this.renderGiantLogo(root);
  },

  renderGiantLogo(root) {
    root.innerHTML = `
      <div class="proj-screen proj-center">
        <div class="proj-logo">
          <h1>BRAINRUSH</h1>
          <div class="proj-logo-bar"></div>
        </div>
        <p class="proj-tagline">Student Induction Programme · 2026</p>
        <p class="proj-tagline-sub">Six stages. One champion.</p>
      </div>`;
  },

  renderQualifiers(root) {
    const qualified = this.state.teams
      .filter(t => t.status === 'active')
      .sort((a, b) => (b.points.r0 || 0) - (a.points.r0 || 0))
      .slice(0, 10);

    root.innerHTML = `
      <div class="proj-screen proj-center">
        <div class="proj-badge">🎯 QUALIFIED FOR ROUND 1</div>
        <h1 class="proj-big-title">TOP 10 TEAMS</h1>
        <div class="proj-qualifiers">
          ${qualified.map((t, i) => `
            <div class="proj-qualifier-row ${i < 3 ? 'top' + (i+1) : ''}">
              <span class="proj-qualifier-rank">${i + 1}</span>
              <span class="proj-qualifier-name">${esc(t.teamName)}</span>
              <span class="proj-qualifier-pts">${t.points.r0 || 0} pts</span>
            </div>`).join('')}
        </div>
        <p class="proj-subtitle-small">Round 1 begins shortly…</p>
      </div>`;
  },

  renderRoundIntro(root) {
    const s = this.state.session;
    const names = {
      1: ['ROUND 1', 'CLOSEST GUESS'],
      2: ['ROUND 2', 'SPEED & ACCURACY'],
      3: ['ROUND 3', 'CHALLENGE MATRIX'],
      4: ['ROUND 4', 'BONUS RAPID-FIRE'],
      5: ['ROUND 5', 'GRAND FINALE']
    };
    const [top, sub] = names[s.round] || ['ROUND', ''];
    root.innerHTML = `
      <div class="proj-screen proj-center proj-roundintro">
        <div class="proj-badge">${top}</div>
        <h1 class="proj-huge-title">${esc(sub)}</h1>
        <p class="proj-subtitle">${s.activeTeamIds.length} teams ready</p>
      </div>`;
  },

  renderActive(root) {
    const s = this.state.session;
    const q = this.currentQuestion();
    if (!q) {
      root.innerHTML = `<div class="proj-screen proj-center"><p class="proj-subtitle">Preparing…</p></div>`;
      return;
    }
    const left = s.questionEndsAt ? Math.max(0, (s.questionEndsAt - Date.now()) / 1000) : 0;
    const total = q.timeLimitSec || 30;
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    const qs = this.state.questions.filter(x => x.roundNumber === s.round && x.isActive);

    root.innerHTML = `
      <div class="proj-screen">
        <div class="proj-topbar">
          <div class="proj-badge">${this.roundLabel(s.round)}</div>
          <div class="proj-badge-soft">Q ${s.qIndex + 1} / ${qs.length}</div>
        </div>
        <h2 class="proj-question-text">${esc(q.text)}</h2>
        <div class="proj-clock proj-clock-big" id="projClock">${this.fmt(left)}</div>
        <div class="proj-progress proj-progress-tall">
          <div class="proj-progress-fill" id="projBar" style="width:${pct}%"></div>
        </div>
      </div>`;
  },

  renderReveal(root) {
    const s = this.state.session;
    const q = this.currentQuestion();
    const rv = s.lastReveal;
    if (!q || !rv) {
      root.innerHTML = `<div class="proj-screen proj-center"><p class="proj-subtitle">Revealing…</p></div>`;
      return;
    }

    let answerBlock = '';
    if (q.type === 'mcq' && q.options) {
      answerBlock = '<div class="proj-options">' + q.options.map((o, i) => `
        <div class="proj-option ${i === q.correctAnswer ? 'proj-option-correct' : ''}">
          <span class="proj-option-key">${String.fromCharCode(65 + i)}</span>
          <span>${esc(o)}</span>
        </div>`).join('') + '</div>';
    } else if (q.type === 'saq') {
      answerBlock = `<div class="proj-answer-text">"${esc(q.correctAnswer)}"</div>`;
    } else {
      answerBlock = `<div class="proj-answer-text">${esc(q.correctAnswer)} ${esc(q.unit || '')}</div>`;
    }

    root.innerHTML = `
      <div class="proj-screen">
        <div class="proj-topbar">
          <div class="proj-badge">${this.roundLabel(s.round)}</div>
          <div class="proj-badge-soft">ANSWER REVEAL</div>
        </div>
        <h2 class="proj-question-text proj-question-text-sm">${esc(q.text)}</h2>
        <div class="proj-correct-label">CORRECT ANSWER</div>
        ${answerBlock}
        ${rv.results && rv.results.length ? `
          <div class="proj-who">
            <h3>SCORED THIS QUESTION</h3>
            <div class="proj-who-list">
              ${rv.results.map(r => {
                const t = this.state.teams.find(x => x.id === r.teamId);
                const p = r.points != null ? r.points : 0;
                const cls = p > 0 ? 'good' : p < 0 ? 'bad' : '';
                return `<div class="proj-who-item ${cls}">
                  <span>${esc(t ? t.teamName : '?')}</span>
                  <span class="proj-who-pts">${p > 0 ? '+' : ''}${p}</span>
                </div>`;
              }).join('')}
            </div>
          </div>` : ''}
      </div>`;
  },

  renderRoundEnd(root) {
    const s = this.state.session;
    const lb = this.state.teams
      .filter(t => t.status !== 'registered' && t.status !== 'disqualified')
      .sort((a, b) => (b.points.total || 0) - (a.points.total || 0))
      .slice(0, 8);

    const eliminated = this.state.teams
      .filter(t => t.status === 'eliminated' && t.eliminatedInRound === s.round);

    root.innerHTML = `
      <div class="proj-screen proj-center">
        <div class="proj-badge">ROUND ${s.round} COMPLETE</div>
        <h2 class="proj-big-title">LEADERBOARD</h2>
        <div class="proj-lb">
          ${lb.map((t, i) => `
            <div class="proj-lb-row ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
              <span class="proj-lb-rank">${i + 1}</span>
              <span class="proj-lb-name">${esc(t.teamName)}</span>
              <span class="proj-lb-pts">${t.points.total || 0}</span>
            </div>`).join('')}
        </div>
        ${eliminated.length ? `
          <div class="proj-eliminated">
            <h3>ELIMINATED</h3>
            <p>${eliminated.map(t => esc(t.teamName)).join(' · ')}</p>
          </div>` : ''}
      </div>`;
  },

  renderFinished(root) {
    const winners = this.state.teams
      .filter(t => t.finalRank)
      .sort((a, b) => a.finalRank - b.finalRank);
    const champ = winners[0];

    root.innerHTML = `
      <div class="proj-screen proj-center proj-finished">
        <div class="proj-trophy">🏆</div>
        <div class="proj-badge">CHAMPION</div>
        <h1 class="proj-huge-title">${champ ? esc(champ.teamName) : '—'}</h1>
        ${winners.length ? `
          <div class="proj-final-board">
            ${winners.slice(0, 5).map(t => `
              <div class="proj-final-row ${t.finalRank === 1 ? 'gold' : ''}">
                <span class="proj-final-rank">#${t.finalRank}</span>
                <span class="proj-final-name">${esc(t.teamName)}</span>
                <span class="proj-final-pts">${t.points.total || 0}</span>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  },

  roundLabel(n) {
    return {
      1: 'ROUND 1 · CLOSEST GUESS',
      2: 'ROUND 2 · SPEED & ACCURACY',
      3: 'ROUND 3 · CHALLENGE MATRIX',
      4: 'ROUND 4 · BONUS RAPID-FIRE',
      5: 'ROUND 5 · GRAND FINALE'
    }[n] || 'ROUND';
  },

  currentQuestion() {
    const s = this.state.session;
    if (s.state === 'QUESTION_ACTIVE' || s.state === 'QUESTION_REVEAL') {
      return this.state.questions.find(q => q.id === s.currentQuestionId) || null;
    }
    return null;
  },

  fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return m + ':' + ss;
  }
};

/* ---- Local clock tick every 250ms ---- */
setInterval(() => {
  if (!Projector.state) return;
  const s = Projector.state.session;
  const clockEl = document.getElementById('projClock');
  const barEl = document.getElementById('projBar');
  if (!clockEl || !barEl) return;

  let left = 0;
  const q = Projector.currentQuestion();
  if (s.state === 'QUESTION_ACTIVE' && s.questionEndsAt) {
    left = (s.questionEndsAt - Date.now()) / 1000;
  } else {
    return;
  }

  const txt = Projector.fmt(left);
  if (clockEl.textContent !== txt) clockEl.textContent = txt;
  if (q && q.timeLimitSec) {
    barEl.style.width = Math.max(0, Math.min(100, (left / q.timeLimitSec) * 100)) + '%';
  }
}, 250);

try { Projector.boot(); } catch (e) {
  console.error(e);
  document.body.innerHTML = '<div style="padding:40px;color:#ff4d6d;font-family:monospace">Boot error: ' + e.message + '</div>';
}