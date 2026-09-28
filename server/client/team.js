'use strict';

/* ============================================================
   BRAINRUSH — Team View
   ============================================================ */

const Team = {
  state: null,
  teamId: null,
  timerHandle: null,

  loadTeamId() {
    if (this.teamId) return this.teamId;
    try {
      const v = sessionStorage.getItem('brainrush:teamid');
      if (v) this.teamId = v;
    } catch (e) {}
    return this.teamId;
  },
  saveTeamId(id) {
    this.teamId = id;
    try { sessionStorage.setItem('brainrush:teamid', id); } catch (e) {}
  },

  setState(s) {
    this.state = s;
    this.loadTeamId();
    render();
  },

  /* ---- Actions ---- */
  register(teamName, students) {
    Socket.emit('team:register', { teamName, students }, (r) => {
      if (!r || !r.ok) { toast('⚠ ' + ((r && r.reason) || 'Registration failed')); return; }
      this.saveTeamId(r.teamId);
      toast('✓ Registration sent');
      render();
    });
  },
  ackInstructions() { Socket.emit('team:ackInstructions'); },
  submitAnswer(questionId, answer) {
    Socket.emit('team:answer', { questionId, answer }, (r) => {
      if (r && !r.ok) toast('⚠ ' + (r.reason || 'Not accepted'));
    });
  },
  pressBuzz(questionId) {
    Socket.emit('team:buzz', { questionId }, (r) => {
      if (r && !r.ok) toast('⚠ ' + (r.reason || 'Buzzer not available'));
    });
  },
  pressChallenge(questionId) {
    Socket.emit('team:challenge', { questionId }, (r) => {
      if (r && !r.ok) toast('⚠ ' + (r.reason || 'Challenge failed'));
    });
  },

  /* ---- Helpers ---- */
  myTeam() {
    if (!this.state) return null;
    this.loadTeamId();
    if (!this.teamId) return null;
    return this.state.teams.find(t => t.id === this.teamId) || null;
  },
  currentQuestion() {
    const s = this.state.session;
    return this.state.questions.filter(x => x.roundNumber === s.round && x.isActive)
      .sort((a, b) => a.order - b.order)[s.qIndex] || null;
  },
  points(me) { return (me && me.points && me.points.total) || 0; },
  statusLabel(me) {
    if (!me) return '';
    switch (me.status) {
      case 'registered': return 'PENDING';
      case 'approved':   return 'APPROVED';
      case 'active':     return 'IN PLAY';
      case 'eliminated': return 'OUT R' + (me.eliminatedInRound || '?');
      case 'winner':     return 'RANK #' + (me.finalRank || '?');
      default:           return me.status;
    }
  },

  /* ---- Render ---- */
  render(root) {
    if (!this.state) {
      root.innerHTML = `<div class="wait-screen">
        <div class="wait-icon">⏳</div>
        <h2>CONNECTING</h2>
        <p>Waiting for BRAINRUSH server…</p>
        <button class="back-btn mt" id="bak">← CHANGE ROLE</button>
      </div>`;
      const b = document.getElementById('bak');
      if (b) b.onclick = () => App.exitRole();
      return;
    }

    const me = this.myTeam();
    const s  = this.state.session;
    if (!me) return this.renderLogin(root);

    const badgeClass = me.status === 'active' ? 'live' : 'info';
    root.innerHTML = `
      <div class="app">
        <div class="topbar">
          <div class="brand"><span class="dot"></span>${esc(me.teamName)}</div>
          <div class="flex">
            <span class="badge ${badgeClass}">${esc(this.statusLabel(me))}</span>
            <span class="badge">${this.points(me)} PTS</span>
            <button class="btn sm ghost" id="exit2">EXIT</button>
          </div>
        </div>
        <div class="main"><div id="tc"></div></div>
      </div>`;

    const exitBtn = document.getElementById('exit2');
    if (exitBtn) exitBtn.onclick = () => App.exitRole();
    const c = document.getElementById('tc');
    if (!c) return;

    if (me.status === 'registered')     return this.wait(c, me, 'Waiting for admin approval…');
    if (s.state === 'LOBBY')            return this.wait(c, me, 'Approved! Waiting for the quiz…');
    if (s.state === 'INSTRUCTIONS')     return this.instructions(c, me, s);
    if (s.state === 'ROUND_INTRO')      return this.roundIntro(c, s);
    if (s.state === 'QUESTION_ACTIVE')  return this.question(c, me, s);
    if (s.state === 'QUESTION_REVEAL')  return this.reveal(c, me, s);
    if (s.state === 'ROUND_END')        return this.roundEnd(c, me, s);
    if (s.state === 'FINISHED')         return this.finished(c, me);
  },

  renderLogin(root) {
    root.innerHTML = `
      <div class="reg-screen">
        <div class="reg-card">
          <h2>TEAM REGISTRATION</h2>
          <p class="subtitle">Two students share one device.</p>
          <div class="field"><label>TEAM NAME</label><input id="tn" placeholder="e.g. Quantum Quokkas" maxlength="40" autocomplete="off"></div>
          <div class="divider"></div>
          <div class="field"><label>STUDENT 1 · NAME</label><input id="s1n" autocomplete="off"></div>
          <div class="field"><label>STUDENT 1 · ROLL</label><input id="s1r" inputmode="numeric" autocomplete="off"></div>
          <div class="divider"></div>
          <div class="field"><label>STUDENT 2 · NAME</label><input id="s2n" autocomplete="off"></div>
          <div class="field"><label>STUDENT 2 · ROLL</label><input id="s2r" inputmode="numeric" autocomplete="off"></div>
          <button class="btn primary block mt" id="reg">REGISTER TEAM →</button>
        </div>
        <button class="back-btn" id="bak2">← CHANGE ROLE</button>
      </div>`;

    document.getElementById('reg').onclick = () => {
      const teamName = document.getElementById('tn').value.trim();
      const s1n = document.getElementById('s1n').value.trim();
      const s1r = document.getElementById('s1r').value.trim();
      const s2n = document.getElementById('s2n').value.trim();
      const s2r = document.getElementById('s2r').value.trim();
      if (!teamName || !s1n || !s1r || !s2n || !s2r) return toast('⚠ Fill all fields');
      Team.register(teamName, [
        { name: s1n, rollNumber: s1r },
        { name: s2n, rollNumber: s2r }
      ]);
    };
    document.getElementById('bak2').onclick = () => App.exitRole();
  },

  wait(c, me, msg) {
    c.innerHTML = `<div class="wait-screen">
      <div class="wait-icon">⏳</div>
      <h2>${esc(msg)}</h2>
      <p>Team: <b style="color:var(--copper-light)">${esc(me.teamName)}</b></p>
      <p class="small muted mt">Keep this tab open.</p>
    </div>`;
  },

  instructions(c, me, s) {
    const left = Math.max(0, (s.instructionsEndsAt - now()) / 1000);
    c.innerHTML = `<div class="wait-screen"><div class="instr-card">
      <h2>📖 INSTRUCTIONS</h2>
      <p class="muted">Read carefully before entering the waiting room.</p>
      <ul>
        <li>4 rounds: Closest Guess → Speed &amp; Accuracy → Challenge Matrix → Buzzer Finale</li>
        <li>10 teams start. Bottom teams are eliminated after each round.</li>
        <li>Round 3: Challenge button lets you steal a question for bonus points.</li>
        <li>Round 4: First to press the buzzer locks the question.</li>
        <li>Do not refresh or close this tab during a round.</li>
      </ul>
      <div class="instr-footer">
        <label class="agree-label">
          <input type="checkbox" id="agree" ${me.instructionsAck ? 'checked disabled' : ''}>
          <span>I agree to the rules</span>
        </label>
        <div class="instr-timer">${fmtClock(left)}</div>
      </div>
    </div></div>`;
    const cb = document.getElementById('agree');
    if (cb && !me.instructionsAck) cb.onchange = () => { if (cb.checked) Team.ackInstructions(); };
  },

  roundIntro(c, s) {
    const desc = {
      1: '6 prediction questions. Answer as close as possible.',
      2: '10 questions. Speed + accuracy wins.',
      3: '18 questions, turn-based. Challenge to steal.',
      4: '10 rapid-fire questions. Buzz first.'
    };
    const names = { 1: 'Closest Guess', 2: 'Speed & Accuracy', 3: 'Challenge Matrix', 4: 'Buzzer Finale' };
    c.innerHTML = `<div class="wait-screen">
      <div class="pill round" style="margin-bottom:18px">ROUND ${s.round}</div>
      <h2 style="font-size:clamp(24px,6vw,40px)">${names[s.round]}</h2>
      <p style="max-width:480px;margin:16px auto 0;font-size:15px">${desc[s.round]}</p>
    </div>`;
  },

  startTimer(q, s) {
    if (this.timerHandle) clearInterval(this.timerHandle);
    const tEl = document.getElementById('qt');
    const bEl = document.getElementById('qb');
    if (!tEl || !bEl) return;
    const endsAt = s.questionEndsAt || (now() + q.timeLimitSec * 1000);
    const total  = q.timeLimitSec;
    const tick = () => {
      const left = Math.max(0, (endsAt - now()) / 1000);
      tEl.textContent = fmtClock(left);
      tEl.className = 'timer' + (left <= 5 ? ' danger' : left <= 10 ? ' warn' : '');
      bEl.style.width = (left / total * 100) + '%';
      if (left <= 0) {
        clearInterval(this.timerHandle);
        tEl.textContent = '0:00';
        bEl.style.width = '0%';
      }
    };
    tick();
    this.timerHandle = setInterval(tick, 200);
  },

  question(c, me, s) {
    const q = this.currentQuestion();
    if (!q) return this.wait(c, me, 'Waiting for next question…');

    const myAns       = this.state.answers.find(a => a.questionId === q.id && a.teamId === me.id);
    const isActive    = s.activeTeamIds.indexOf(me.id) !== -1;
    const isMyTurn    = s.round === 3 ? s.activeTeamId === me.id : true;
    const challenge   = s.challenge && s.challenge.questionId === q.id ? s.challenge : null;
    const iChallenged = challenge && challenge.challengerId === me.id;
    const buzzMine    = s.round === 4 && s.buzzerLockedByTeamId === me.id;
    const buzzTheirs  = s.round === 4 && s.buzzerLockedByTeamId && s.buzzerLockedByTeamId !== me.id;

    let turnBanner = '';
    if (s.round === 3) {
      const tt = this.state.teams.find(t => t.id === s.activeTeamId);
      turnBanner = isMyTurn ? '<span class="pill you">🎯 YOUR TURN</span>'
        : `<span class="pill turn">Turn: ${esc(tt ? tt.teamName : '…')}</span>`;
    }
    if (challenge) {
      const ct = this.state.teams.find(t => t.id === challenge.challengerId);
      turnBanner = iChallenged
        ? '<span class="pill" style="background:rgba(255,217,61,.2);color:var(--warn-yellow);border-color:rgba(255,217,61,.5)">⚡ YOU CHALLENGED</span>'
        : `<span class="pill" style="background:rgba(255,217,61,.2);color:var(--warn-yellow);border-color:rgba(255,217,61,.5)">⚡ ${esc(ct ? ct.teamName : '?')} CHALLENGED</span>`;
    }

    c.innerHTML = `<div class="stage">
      <div class="qheader">
        <div class="flex">
          <span class="pill round">ROUND ${s.round}</span>
          <span class="pill qnum">Q ${s.qIndex + 1}</span>
          ${turnBanner}
        </div>
        <div class="timer" id="qt">--:--</div>
      </div>
      <div class="timer-bar"><div id="qb" style="width:100%"></div></div>
      <div class="qtext-big">${esc(q.text)}</div>
      <div id="aa"></div>
    </div>`;

    const a = document.getElementById('aa');
    if (!a) return;

    if (myAns) {
      a.innerHTML = `<div class="result-banner neutral">Answer submitted: <b>${esc(String(myAns.rawAnswer))}</b></div>`;
    } else if (s.round === 4) {
      this.renderBuzz(a, q, s, buzzMine, buzzTheirs);
    } else if (s.round === 3 && !isMyTurn && !iChallenged) {
      a.innerHTML = `<div class="center">
        <p class="muted mb">It's not your turn.</p>
        ${!challenge ? '<button class="challenge-btn" id="ch">⚡ CHALLENGE &amp; STEAL</button>'
          : '<p class="muted">Challenge in progress…</p>'}
      </div>`;
      const ch = document.getElementById('ch');
      if (ch) ch.onclick = () => Team.pressChallenge(q.id);
    } else if (isActive && (s.round !== 3 || isMyTurn || iChallenged) && (s.round !== 4 || buzzMine)) {
      if (q.type === 'closest_guess') {
        a.innerHTML = `<div class="guess-input">
          <input id="gi" type="number" placeholder="Your guess" inputmode="numeric">
          <div class="unit">${esc(q.unit || 'value')}</div>
        </div>
        <button class="btn primary block mt" id="sg">SUBMIT GUESS</button>`;
        const submit = () => {
          const v = document.getElementById('gi').value;
          if (v === '') return toast('⚠ Enter a number');
          Team.submitAnswer(q.id, Number(v));
        };
        document.getElementById('sg').onclick = submit;
        document.getElementById('gi').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      } else {
        a.innerHTML = this.mcqHTML(q);
        this.bindMCQ(a, (idx) => Team.submitAnswer(q.id, idx));
      }
    } else {
      a.innerHTML = '<div class="result-banner neutral">Waiting for other teams…</div>';
    }

    this.startTimer(q, s);
  },

  renderBuzz(a, q, s, buzzMine, buzzTheirs) {
    if (buzzMine) {
      const leftS = Math.ceil((s.buzzerLockEndsAt - now()) / 1000);
      a.innerHTML = `<div class="center">
        <div class="big-buzzer locked">YOURS!</div>
        <p class="muted mb">Answer within ${leftS}s</p>
        ${this.mcqHTML(q)}
      </div>`;
      this.bindMCQ(a, (idx) => Team.submitAnswer(q.id, idx));
    } else if (buzzTheirs) {
      const t = this.state.teams.find(x => x.id === s.buzzerLockedByTeamId);
      a.innerHTML = `<div class="result-banner bad">🔔 ${esc(t ? t.teamName : '?')} buzzed first</div>`;
    } else {
      a.innerHTML = `<div class="center">
        <button class="big-buzzer" id="buzz">BUZZ</button>
        <p class="muted small">First to press locks the question</p>
      </div>`;
      document.getElementById('buzz').onclick = () => Team.pressBuzz(q.id);
    }
  },

  mcqHTML(q) {
    return '<div class="options">' + q.options.map((o, i) => `
      <button class="opt" data-i="${i}">
        <span class="key">${String.fromCharCode(65 + i)}</span>
        <span>${esc(o)}</span>
      </button>`).join('') + '</div>';
  },

  bindMCQ(root, cb) {
    const opts = root.querySelectorAll('.opt');
    opts.forEach(el => {
      el.onclick = () => {
        opts.forEach(x => { x.disabled = true; });
        el.classList.add('selected');
        cb(+el.dataset.i);
      };
    });
  },

  reveal(c, me, s) {
    const q  = this.currentQuestion();
    const rv = s.lastReveal;
    if (!q || !rv || rv.questionId !== q.id) return this.wait(c, me, 'Revealing…');

    const myRes = rv.results.find(r => r.teamId === me.id);
    let banner = '<div class="result-banner neutral">No answer recorded</div>';
    if (myRes) {
      if (myRes.points > 0)      banner = `<div class="result-banner good">✓ +${myRes.points} PTS</div>`;
      else if (myRes.points < 0) banner = `<div class="result-banner bad">✗ ${myRes.points} PTS</div>`;
      else                       banner = '<div class="result-banner bad">✗ NO POINTS</div>';
    }

    let correct;
    if (q.type === 'mcq') {
      correct = '<div class="options">' + q.options.map((o, i) => `
        <div class="opt ${i === q.correctAnswer ? 'correct' : ''}">
          <span class="key">${String.fromCharCode(65 + i)}</span>
          <span>${esc(o)}</span>
        </div>`).join('') + '</div>';
    } else {
      correct = `<div class="result-banner good" style="font-size:20px">Correct: ${esc(rv.correctAnswer)} ${esc(rv.unit || '')}</div>`;
    }

    let detail = '';
    if (rv.note === 'CLOSEST GUESS' && rv.results.length) {
      detail = '<div class="card mt"><h3>CLOSEST GUESSES</h3>' + rv.results.map((r, i) => {
        const t = this.state.teams.find(x => x.id === r.teamId);
        return `<div class="lb-row ${r.teamId === me.id ? 'me' : ''}">
          <div class="rank">${i + 1}</div>
          <div class="tname">${esc(t ? t.teamName : '?')} <span class="muted small">Δ${r.delta}</span></div>
          <div class="pts">+${r.points}</div>
        </div>`;
      }).join('') + '</div>';
    }
    if (rv.note === 'FASTEST FINGER' && rv.results.length) {
      detail = '<div class="card mt"><h3>FASTEST CORRECT</h3>' + rv.results.map(r => {
        const t = this.state.teams.find(x => x.id === r.teamId);
        return `<div class="lb-row ${r.teamId === me.id ? 'me' : ''}">
          <div class="rank">${r.rank}</div>
          <div class="tname">${esc(t ? t.teamName : '?')} <span class="muted small">${r.latencyMs}ms</span></div>
          <div class="pts">+${r.points}</div>
        </div>`;
      }).join('') + '</div>';
    }

    c.innerHTML = `<div class="stage">
      <div class="qheader">
        <div class="flex">
          <span class="pill round">ROUND ${s.round}</span>
          <span class="pill qnum">Q ${s.qIndex + 1}</span>
          <span class="pill" style="background:rgba(196,122,63,.2);color:var(--copper-light);border-color:rgba(196,122,63,.5)">${esc(rv.note)}</span>
        </div>
      </div>
      ${banner}
      <div class="qtext-big" style="font-size:16px;color:var(--mut)">${esc(q.text)}</div>
      ${correct}
      ${detail}
    </div>`;
  },

  roundEnd(c, me, s) {
    const lb = this.state.teams.filter(t => t.points).slice()
      .sort((a, b) => this.points(b) - this.points(a));
    const isOut = me.status === 'eliminated';
    const rows = lb.map((t, i) => {
      const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const dim = t.status === 'eliminated' ? 'opacity:.45' : '';
      return `<div class="lb-row ${cls} ${t.id === me.id ? 'me' : ''}" style="${dim}">
        <div class="rank">${i + 1}</div>
        <div class="tname">${esc(t.teamName)}</div>
        <div class="pts">${this.points(t)}</div>
      </div>`;
    }).join('');

    c.innerHTML = `<div class="stage">
      <div class="card" style="text-align:center;padding:28px 20px">
        <h2 style="font-family:'Orbitron',sans-serif;font-size:18px;letter-spacing:1.5px">ROUND ${s.round} COMPLETE</h2>
        ${isOut
          ? '<p style="color:var(--danger-red);font-size:15px;font-weight:600;margin-top:14px">Your team was eliminated. Thanks for playing!</p>'
          : '<p style="color:var(--acid-green);font-size:15px;font-weight:600;margin-top:14px">You survived! Next round starting soon…</p>'}
      </div>
      <div class="card mt"><h3>LEADERBOARD</h3>${rows}</div>
    </div>`;
  },

  finished(c, me) {
    const winners = this.state.teams.filter(t => t.finalRank).sort((a, b) => a.finalRank - b.finalRank);
    let medal = '';
    if (me.finalRank === 1)      medal = '<p style="color:var(--gold);font-size:20px;font-weight:800;margin-top:14px">🥇 1st Place — Congratulations!</p>';
    else if (me.finalRank === 2) medal = '<p style="color:#cbd5e1;font-size:20px;font-weight:800;margin-top:14px">🥈 2nd Place — Well played!</p>';
    else if (me.finalRank)       medal = `<p class="muted" style="font-size:16px;margin-top:14px">You finished #${me.finalRank}</p>`;
    else if (me.status === 'eliminated') medal = `<p class="muted" style="font-size:15px;margin-top:14px">Eliminated in Round ${me.eliminatedInRound || '?'}</p>`;

    const rows = winners.map(t => {
      const cls = t.finalRank === 1 ? 'top1' : t.finalRank === 2 ? 'top2' : t.finalRank === 3 ? 'top3' : '';
      return `<div class="lb-row ${cls} ${t.id === me.id ? 'me' : ''}">
        <div class="rank">${t.finalRank}</div>
        <div class="tname">${esc(t.teamName)}</div>
        <div class="pts">${this.points(t)}</div>
      </div>`;
    }).join('');

    c.innerHTML = `<div class="stage">
      <div class="card" style="text-align:center;padding:40px 20px">
        <div style="font-size:56px;margin-bottom:10px">🏆</div>
        <h1 style="font-family:'Orbitron',sans-serif;font-size:24px;letter-spacing:2px">QUIZ COMPLETE</h1>
        ${medal}
      </div>
      ${winners.length ? `<div class="card mt"><h3>FINAL STANDINGS</h3>${rows}</div>` : ''}
    </div>`;
  }
};