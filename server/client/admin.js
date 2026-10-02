'use strict';

const Admin = {
  tab: 'control',
  state: null,
  _step: 'mobile',
  _mobile: '',
  _devOtp: null,

  /* ---- Auth ---- */
  get token() {
    try { return sessionStorage.getItem('brainrush:adminToken'); } catch (e) { return null; }
  },
  get adminName() {
    try { return sessionStorage.getItem('brainrush:adminName') || ''; } catch (e) { return ''; }
  },
  setAuth(token, name, mobile, adminId) {
    try {
      sessionStorage.setItem('brainrush:adminToken', token);
      sessionStorage.setItem('brainrush:adminName', name || '');
      sessionStorage.setItem('brainrush:adminMobile', mobile || '');
      sessionStorage.setItem('brainrush:adminId', adminId || '');
    } catch (e) {}
  },
  clearAuth() {
    try {
      sessionStorage.removeItem('brainrush:adminToken');
      sessionStorage.removeItem('brainrush:adminName');
      sessionStorage.removeItem('brainrush:adminMobile');
      sessionStorage.removeItem('brainrush:adminId');
    } catch (e) {}
  },

  setState(s) {
    const prev = this.state;
    this.state = s;

    if (prev && this._sameAdmin(prev, s)) return;

    const savedInput = this._saveInput();
    render();
    this._restoreInput(savedInput);
  },

  _sameAdmin(a, b) {
    if (!a || !b) return false;
    const sa = a.session, sb = b.session;
    if (sa.state !== sb.state) return false;
    if (sa.round !== sb.round) return false;
    if (sa.qIndex !== sb.qIndex) return false;
    if (sa.currentQuestionId !== sb.currentQuestionId) return false;
    if (sa.buzzerLockedByTeamId !== sb.buzzerLockedByTeamId) return false;
    if ((sa.challenge && sa.challenge.challengerId) !== (sb.challenge && sb.challenge.challengerId)) return false;
    if (a.teams.length !== b.teams.length) return false;
    if (a.answers.length !== b.answers.length) return false;
    if (a.questions.length !== b.questions.length) return false;
    if ((sa.questionEndsAt || 0) !== (sb.questionEndsAt || 0)) return false;
    for (let i = 0; i < a.teams.length; i++) {
      const ta = a.teams[i], tb = b.teams[i];
      if (!tb || ta.id !== tb.id) return false;
      if (ta.status !== tb.status) return false;
      if ((ta.points.total || 0) !== (tb.points.total || 0)) return false;
      const fa = (ta.flags || []).length;
      const fb = (tb.flags || []).length;
      if (fa !== fb) return false;
    }
    return true;
  },

  _saveInput() {
    const el = document.activeElement;
    if (!el || !el.tagName) return null;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return null;
    if (!el.id) return null;
    return { id: el.id, value: el.value, selStart: el.selectionStart, selEnd: el.selectionEnd };
  },

  _restoreInput(saved) {
    if (!saved) return;
    const el = document.getElementById(saved.id);
    if (!el) return;
    el.value = saved.value;
    try { el.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) {}
    el.focus();
  },

  /* ---- OTP ---- */
  requestOtp(mobile, onSuccess) {
    Socket.emit('admin:requestOtp', { mobile }, (r) => {
      if (!r || !r.ok) { toast('⚠ ' + ((r && r.reason) || 'Failed')); return; }
      toast('✓ OTP sent');
      onSuccess(r);
    });
  },
  verifyOtp(mobile, otp, onSuccess) {
    Socket.emit('admin:verifyOtp', { mobile, otp }, (r) => {
      if (!r || !r.ok) { toast('⚠ ' + ((r && r.reason) || 'Failed')); return; }
      this.setAuth(r.token, r.name, mobile, r.adminId);
      toast('✓ Logged in as ' + r.name);
      onSuccess(r);
    });
  },
  logout() {
    this.clearAuth();
    App.exitRole();
  },

  /* ---- Actions ---- */
  approve(teamId, yes)    { Socket.emit('admin:approveTeam', { teamId, yes }); },
  approveAll()            { Socket.emit('admin:approveAll'); },
  deleteTeam(teamId) {
    if (!confirm('Delete this team permanently?')) return;
    Socket.emit('admin:deleteTeam', { teamId }, (r) => {
      if (r && !r.ok) toast('⚠ ' + (r.reason || 'Delete failed'));
      else toast('✓ Team removed');
    });
  },
  requalifyTeam(teamId) {
    if (!confirm('Put this team back into the live round? Their progress will be preserved.')) return;
    Socket.emit('admin:requalifyTeam', { teamId }, (r) => {
      if (r && !r.ok) toast('⚠ ' + (r.reason || 'Failed'));
      else toast('✓ ' + (r.teamName || 'Team') + ' rejoined');
    });
  },
  disqualifyTeam(teamId) {
    const t = this.state.teams.find(x => x.id === teamId);
    if (!t) return;
    if (!confirm('Manually disqualify ' + t.teamName + '?')) return;
    Socket.emit('admin:disqualifyTeam', { teamId }, () => {
      toast('✓ ' + t.teamName + ' disqualified');
    });
  },
  showFlags(teamId) {
    const t = this.state.teams.find(x => x.id === teamId);
    if (!t) return;
    const flags = t.flags || [];
    if (!flags.length) return alert(t.teamName + ': no flags.');

    const lines = flags.slice().reverse().map(f => {
      const time = new Date(f.at).toLocaleTimeString();
      return `${time}  ·  ${f.reason}  (${f.state}${f.round ? ' R' + f.round : ''})`;
    }).join('\n');

    alert(`⚠ ${t.teamName} — ${flags.length} flag(s)\n\n${lines}`);
  },
  sendToInstructions()    { Socket.emit('admin:sendToInstructions'); },
  closeInstructions()     { Socket.emit('admin:closeInstructions'); },
  startSelection()        { Socket.emit('admin:startSelection', {}, (r) => {
                              if (r && !r.ok) toast('⚠ ' + (r.reason || 'Cannot start'));
                            }); },
  qualifySelection()      { Socket.emit('admin:qualifySelection', {}, (r) => {
                              if (r && r.ok) {
                                if (r.qualified < 2) toast('⚠ Only ' + r.qualified + ' team(s) qualified');
                                else toast('✓ ' + r.qualified + ' teams qualified');
                              }
                              else if (r) toast('⚠ ' + (r.reason || 'Failed'));
                            }); },
  startRound(n)           { Socket.emit('admin:startRound', { round: n }, (r) => {
                              if (r && !r.ok) toast('⚠ ' + (r.reason || 'Cannot start'));
                            }); },
  nextQuestion()          { Socket.emit('admin:nextQuestion'); },
  forceReveal()           { Socket.emit('admin:forceReveal'); },
  endSession()            { Socket.emit('admin:endSession'); },
  resetSession()          { Socket.emit('admin:resetSession'); },
  clearAll()              { if (confirm('Delete ALL teams and answers? (Questions are kept)')) Socket.emit('admin:clearAll'); },
  backLobby()             { Socket.emit('admin:closeInstructions'); },
  addQuestion(o)          { Socket.emit('admin:question:add', o); },
  editQuestion(id, patch) { Socket.emit('admin:question:edit', { id, patch }); },
  deleteQuestion(id)      { Socket.emit('admin:question:delete', { id }); },
  moveQuestion(id, dir)   { Socket.emit('admin:question:move', { id, direction: dir }); },

  roundQuestions(r) {
    return this.state.questions.filter(q => q.roundNumber === r && q.isActive)
      .sort((a, b) => a.order - b.order);
  },
  currentQuestion() {
    const s = this.state.session;
    return this.roundQuestions(s.round)[s.qIndex] || null;
  },
  leaderboard(showAll) {
    const db = this.state;
    const ids = showAll
      ? db.teams.filter(t => t.status !== 'registered' && t.status !== 'disqualified').map(t => t.id)
      : (db.session.activeTeamIds.length ? db.session.activeTeamIds
          : db.teams.filter(t => t.status !== 'registered' && t.status !== 'disqualified').map(t => t.id));
    return db.teams.filter(t => ids.includes(t.id)).slice()
      .sort((a, b) => (b.points.total || 0) - (a.points.total || 0)
                   || (a.latency || 0) - (b.latency || 0));
  },

  render(root) {
    if (!this.token) return this.renderLogin(root);
    if (!this.state) {
      root.innerHTML = '<div class="wait-screen"><p>Loading admin panel…</p></div>';
      return;
    }
    const db = this.state;
    const s = db.session;
    const labels = {
      LOBBY:'Lobby', INSTRUCTIONS:'Instructions', ROUND_INTRO:'Round Intro',
      SELECTION:'Selection Round',
      QUESTION_ACTIVE:'Question Live', QUESTION_REVEAL:'Reveal',
      ROUND_END:'Round End', FINISHED:'Finished'
    };

    root.innerHTML = `
      <div class="app">
        <div class="topbar">
          <div class="brand"><span class="dot"></span>BRAINRUSH <span class="badge info">${esc(this.adminName || 'ADMIN')}</span></div>
          <div class="flex">
            <span class="badge ${s.state === 'QUESTION_ACTIVE' ? 'live' : ''}">${labels[s.state] || s.state}</span>
            <span class="badge">R${s.round} · Q${s.qIndex + 1}</span>
            <button class="btn sm ghost" id="exit">LOGOUT</button>
          </div>
        </div>
        <div class="main">
          <div class="tabs">
            <button class="tab ${this.tab === 'control' ? 'active' : ''}" data-tab="control">🎮 CONTROL</button>
            <button class="tab ${this.tab === 'teams' ? 'active' : ''}" data-tab="teams">👥 TEAMS (${db.teams.length})</button>
            <button class="tab ${this.tab === 'selection' ? 'active' : ''}" data-tab="selection">🎯 SELECTION</button>
            <button class="tab ${this.tab === 'bank' ? 'active' : ''}" data-tab="bank">📚 Q-BANK (${db.questions.length})</button>
            <button class="tab ${this.tab === 'board' ? 'active' : ''}" data-tab="board">🏆 BOARD</button>
          </div>
          <div id="ac"></div>
        </div>
      </div>`;

    document.getElementById('exit').onclick = () => {
      if (confirm('Log out of admin panel?')) Admin.logout();
    };
    document.querySelectorAll('.tab').forEach(el => el.onclick = () => {
      this.tab = el.dataset.tab; render();
    });

    const c = document.getElementById('ac');
    if (!c) return;
    if (this.tab === 'control') this.renderControl(c);
    else if (this.tab === 'teams') this.renderTeams(c);
    else if (this.tab === 'selection') this.renderSelectionSheet(c);
    else if (this.tab === 'bank') this.renderBank(c);
    else if (this.tab === 'board') this.renderBoard(c);
  },

  renderLogin(root) {
    if (this._step === 'otp') return this.renderOtp(root);
    return this.renderMobile(root);
  },

  renderMobile(root) {
    root.innerHTML = `
      <div class="reg-screen">
        <div class="reg-card">
          <h2>🛡️ ADMIN LOGIN</h2>
          <p class="subtitle">Enter your registered mobile number</p>
          <div class="field">
            <label>MOBILE NUMBER</label>
            <input id="adminMobile" type="tel" inputmode="numeric"
                   placeholder="10-digit mobile" maxlength="10" autocomplete="off">
          </div>
          <button class="btn primary block mt" id="sendOtp">SEND OTP →</button>
        </div>
        <button class="back-btn" id="backBtn">← BACK TO ROLES</button>
      </div>`;

    document.getElementById('sendOtp').onclick = () => {
      const mobile = document.getElementById('adminMobile').value.trim();
      if (!/^\d{10}$/.test(mobile)) return toast('⚠ Enter 10-digit mobile');
      const btn = document.getElementById('sendOtp');
      btn.disabled = true;
      btn.textContent = 'SENDING…';
      Admin.requestOtp(mobile, (r) => {
        Admin._mobile = mobile;
        Admin._step = 'otp';
        Admin._devOtp = r.devOtp || null;
        Admin.render(root);
      });
      setTimeout(() => { btn.disabled = false; btn.textContent = 'SEND OTP →'; }, 3000);
    };
    document.getElementById('backBtn').onclick = () => {
      App.role = null;
      try { sessionStorage.removeItem('brainrush:role'); } catch (e) {}
      render();
    };
    setTimeout(() => {
      const el = document.getElementById('adminMobile');
      if (el) el.focus();
    }, 100);
  },

  renderOtp(root) {
    root.innerHTML = `
      <div class="reg-screen">
        <div class="reg-card">
          <h2>🔐 VERIFY OTP</h2>
          <p class="subtitle">Enter the 6-digit code sent to ${esc(Admin._mobile || '')}</p>
          <div class="field">
            <label>ONE-TIME PASSWORD</label>
            <input id="adminOtp" type="tel" inputmode="numeric"
                   placeholder="6-digit OTP" maxlength="6" autocomplete="off"
                   style="font-family:'JetBrains Mono',monospace;font-size:24px;text-align:center;letter-spacing:8px">
          </div>
          <button class="btn primary block mt" id="verifyOtp">VERIFY & LOGIN →</button>
          <button class="btn ghost block mt" id="resendOtp" style="font-size:12px">← Resend / Change number</button>
          ${Admin._devOtp ? `<p class="small muted center mt">Dev OTP: <b style="color:var(--copper-light)">${esc(Admin._devOtp)}</b></p>` : ''}
        </div>
      </div>`;

    document.getElementById('verifyOtp').onclick = () => {
      const otp = document.getElementById('adminOtp').value.trim();
      if (!/^\d{6}$/.test(otp)) return toast('⚠ Enter 6-digit OTP');
      const btn = document.getElementById('verifyOtp');
      btn.disabled = true;
      btn.textContent = 'VERIFYING…';
      Admin.verifyOtp(Admin._mobile, otp, () => {
        Admin._step = null;
        Admin._devOtp = null;
        render();
      });
      setTimeout(() => { btn.disabled = false; btn.textContent = 'VERIFY & LOGIN →'; }, 3000);
    };
    document.getElementById('resendOtp').onclick = () => {
      Admin._step = 'mobile';
      Admin.render(root);
    };
    setTimeout(() => {
      const el = document.getElementById('adminOtp');
      if (el) el.focus();
    }, 100);
  },

  renderControl(c) {
    const db = this.state;
    const s = db.session;
    const approved = db.teams.filter(t => t.status === 'approved' || t.status === 'active');
    const canStartSelection = approved.length >= 2 &&
      (s.state === 'LOBBY' || s.state === 'ROUND_END' || s.state === 'FINISHED');

    let controls = '';

    if (s.state === 'LOBBY') {
      controls = `<div class="flex mb">
        <button class="btn primary" id="instr">📖 INSTRUCTIONS</button>
        <button class="btn ${canStartSelection ? 'good' : ''}" id="startSel" ${canStartSelection ? '' : 'disabled'}>
          🎯 START SELECTION ROUND (${approved.length} teams)
        </button>
      </div>`;
    } else if (s.state === 'INSTRUCTIONS') {
      controls = `<p class="muted mb">Teams reading instructions…</p>
        <div class="flex">
          <button class="btn ${canStartSelection ? 'good' : ''}" id="startSel" ${canStartSelection ? '' : 'disabled'}>🎯 START SELECTION ROUND</button>
          <button class="btn ghost" id="closeInstr">CLOSE</button>
        </div>`;
    } else if (s.state === 'SELECTION') {
      const activeCount = s.activeTeamIds.length;
      const answeredCount = (() => {
        let n = 0;
        const sa = s.selectionAnswers || {};
        Object.keys(sa).forEach(tid => {
          if (Object.values(sa[tid].answers || {}).filter(a => a.locked).length > 0) n++;
        });
        return n;
      })();
      controls = `
        <p class="muted mb">Selection round in progress — <b>${activeCount}</b> teams, <b>${answeredCount}</b> submitted at least one answer.</p>
        <button class="btn good block" id="qualifyNow">🏁 END &amp; QUALIFY TOP 10</button>
        <p class="small muted mt">No auto-end. Each team has their own 10-minute timer. Click above when ready.</p>`;
    } else if (s.state === 'ROUND_INTRO') {
      controls = '<p class="muted">Round intro — auto-advancing…</p>';
    } else if (s.state === 'QUESTION_ACTIVE') {
      controls = `<p class="muted mb">Question live.</p>
        <button class="btn warn block" id="forceReveal">⏭ FORCE REVEAL</button>`;
    } else if (s.state === 'QUESTION_REVEAL') {
      const qs = this.roundQuestions(s.round);
      const isLastQ = s.qIndex + 1 >= qs.length;
      controls = `
        <p class="muted mb">Reveal showing.</p>
        <button class="btn primary block" id="skipReveal">
          ${isLastQ ? '🏁 SHOW SCORE' : '⏩ NEXT QUESTION'}
        </button>`;
    } else if (s.state === 'ROUND_END') {
      if (s.round === 0) {
        const qualifiers = s.activeTeamIds.length;
        controls = `<p class="muted mb">Selection complete. <b>${qualifiers}</b> teams qualified.</p>
          <button class="btn primary block" id="startR1">▶ START ROUND 1 (${qualifiers} teams)</button>`;
      } else {
        const next = s.round + 1;
        const remaining = s.activeTeamIds.length;
        controls = `<p class="muted mb">Round ${s.round} complete. Survivors: <b>${remaining}</b></p>
          <div class="flex">
            ${next <= 5 ? `<button class="btn primary" id="startN" data-r="${next}">▶ START ROUND ${next} (${remaining} teams)</button>` : ''}
            <button class="btn bad" id="endNow">🏁 END SESSION</button>
          </div>`;
      }
    } else if (s.state === 'FINISHED') {
      controls = `<p class="muted mb">Session finished.</p>
        <div class="flex">
          <button class="btn primary" id="reset">🔄 RESET</button>
          <button class="btn ghost" id="backLobby">LOBBY</button>
        </div>`;
    }

    const q = this.currentQuestion();
    c.innerHTML = `
      <div class="grid sidebar">
        <div>
          <div class="card mb"><h3>ROUND CONTROLS</h3>${controls}</div>
          <div class="card mb">
            <h3>SESSION STATS</h3>
            <div class="grid three" style="gap:10px">
              <div class="stat"><span class="v">${db.teams.length}</span><span class="l">Registered</span></div>
              <div class="stat"><span class="v">${approved.length}</span><span class="l">Approved</span></div>
              <div class="stat"><span class="v">${s.activeTeamIds.length}</span><span class="l">In Play</span></div>
            </div>
            <div class="divider"></div>
            <div class="grid three" style="gap:10px">
              <div class="stat"><span class="v">${db.answers.length}</span><span class="l">Answers</span></div>
              <div class="stat"><span class="v">R${s.round}</span><span class="l">Round</span></div>
              <div class="stat"><span class="v">Q${s.qIndex + 1}</span><span class="l">Index</span></div>
            </div>
          </div>
          <div class="card mb">
            <h3>PROJECTOR</h3>
            <button class="btn primary block sm" id="openProjector">🖥 OPEN PROJECTOR</button>
            <p class="small muted" style="margin-top:8px">Opens audience display in a new tab.</p>
          </div>
          <div class="card">
            <h3>DANGER ZONE</h3>
            <button class="btn bad block sm" id="clearAll">🗑 CLEAR ALL TEAMS</button>
            <p class="small muted" style="margin-top:8px">Removes all teams and answers. Questions are kept.</p>
          </div>
        </div>
        <div>
          <div class="card mb"><h3>CURRENT QUESTION</h3>${q ? this.adminQuestionHTML(q, s) : '<p class="muted">No active question.</p>'}</div>
          <div class="card"><h3>LIVE LEADERBOARD</h3><div id="alb"></div></div>
        </div>
      </div>`;

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) {
        el.onclick = null;
        el.onclick = fn;
      }
    };
    bind('instr',       () => this.sendToInstructions());
    bind('startSel',    () => this.startSelection());
    bind('qualifyNow',  () => this.qualifySelection());
    bind('startR1',     () => this.startRound(1));
    bind('closeInstr',  () => this.closeInstructions());
    bind('forceReveal', () => this.forceReveal());
    bind('skipReveal',  () => this.nextQuestion());
    bind('endNow',      () => this.endSession());
    bind('reset',       () => this.resetSession());
    bind('backLobby',   () => this.backLobby());
    bind('clearAll',    () => this.clearAll());

    const projBtn = document.getElementById('openProjector');
    if (projBtn) projBtn.onclick = () => {
      if (!this.token) return toast('⚠ Not logged in');
      window.open('/projector?token=' + encodeURIComponent(this.token), '_blank');
    };

    document.querySelectorAll('#ac [data-r]').forEach(el => {
      el.onclick = () => this.startRound(+el.dataset.r);
    });
    this.renderLeaderboard(document.getElementById('alb'), false);
  },

  adminQuestionHTML(q, s) {
    let body = `<div style="font-size:16px;font-weight:600;margin-bottom:12px">${esc(q.text)}</div>`;
    if (q.type === 'mcq') {
      body += `<div class="small muted mb">Correct: <b style="color:var(--acid-green)">${esc(q.options[q.correctAnswer])}</b></div>`;
    } else if (q.type === 'saq') {
      body += `<div class="small muted">Correct: <b style="color:var(--acid-green)">${esc(q.correctAnswer)}</b></div>`;
    } else {
      body += `<div class="small muted">Target: <b style="color:var(--acid-green)">${esc(q.correctAnswer)} ${esc(q.unit || '')}</b></div>`;
    }
    const answers = this.state.answers.filter(a => a.questionId === q.id);
    if (answers.length) {
      body += `<div class="divider"></div><div class="small muted mb">Submissions (${answers.length}):</div>`;
      body += answers.map(a => {
        const t = this.state.teams.find(x => x.id === a.teamId);
        return `<div class="small" style="padding:3px 0"><b>${esc(t ? t.teamName : '?')}</b> → <span class="muted">${esc(String(a.rawAnswer))}</span></div>`;
      }).join('');
    }
    if (s.round === 5 && s.buzzerLockedByTeamId) {
      const t = this.state.teams.find(x => x.id === s.buzzerLockedByTeamId);
      body += `<div class="result-banner good" style="margin-top:14px;font-size:13px">🔔 ${esc(t ? t.teamName : '?')}</div>`;
    }
    if (s.challenge) {
      const t = this.state.teams.find(x => x.id === s.challenge.challengerId);
      body += `<div class="result-banner bad" style="margin-top:14px;font-size:13px">⚡ ${esc(t ? t.teamName : '?')}</div>`;
    }
    return body;
  },

  renderTeams(c) {
    const db = this.state;
    const groups = {
      pending:      db.teams.filter(t => t.status === 'registered'),
      approved:     db.teams.filter(t => t.status === 'approved' || t.status === 'active'),
      eliminated:   db.teams.filter(t => t.status === 'eliminated'),
      disqualified: db.teams.filter(t => t.status === 'disqualified'),
      winners:      db.teams.filter(t => t.status === 'winner')
    };

    const row = (t) => {
      let tag = '<span class="tag no">Pending</span>';
      if (t.status === 'approved')     tag = '<span class="tag ok">Approved</span>';
      if (t.status === 'active')       tag = '<span class="tag ok">In Play</span>';
      if (t.status === 'eliminated')   tag = `<span class="tag out">Out R${t.eliminatedInRound == null ? '?' : t.eliminatedInRound}</span>`;
      if (t.status === 'disqualified') tag = '<span class="tag out" style="background:rgba(255,71,87,.3);color:#fff">DISQ</span>';
      if (t.status === 'winner')       tag = `<span class="tag ok">#${t.finalRank || '?'}</span>`;

      const flagCount = (t.flags || []).length;
      const flagBadge = flagCount > 0
        ? `<span class="tag out" style="background:rgba(255,71,87,.25);color:#ff8c9a;cursor:pointer;margin-left:6px" data-flags="${t.id}">⚠ ${flagCount} flag${flagCount === 1 ? '' : 's'}</span>`
        : '';

      return `
        <div class="team-row ${t.status !== 'registered' ? 'approved' : ''} ${t.status === 'eliminated' ? 'eliminated' : ''} ${t.status === 'disqualified' ? 'disqualified' : ''}">
          <div style="flex:1;min-width:0">
            <div class="name">${esc(t.teamName)} ${flagBadge}</div>
            <div class="roll">${esc(t.students[0].name)} (${esc(t.students[0].rollNumber)}) · ${esc(t.students[1].name)} (${esc(t.students[1].rollNumber)})</div>
          </div>
          ${tag}
          <div class="row-actions">
            ${t.status === 'registered' ? `<button class="btn sm good" data-ap="${t.id}">APPROVE</button>` : ''}
            ${(t.status === 'approved' || t.status === 'active') ? `<button class="btn sm ghost" data-rv="${t.id}">REVOKE</button>` : ''}
            ${(t.status === 'active') ? `<button class="btn sm bad" data-dq="${t.id}">DISQUALIFY</button>` : ''}
            ${(t.status === 'disqualified' || t.status === 'eliminated') ? `<button class="btn sm primary" data-rq="${t.id}">↩ REJOIN</button>` : ''}
            <button class="btn sm bad" data-del="${t.id}">DELETE</button>
          </div>
        </div>`;
    };

    c.innerHTML = `
      <div class="grid two">
        <div class="card">
          <div class="flex-between mb">
            <h3 style="margin:0">PENDING (${groups.pending.length})</h3>
            ${groups.pending.length ? '<button class="btn sm good" id="apAll">APPROVE ALL</button>' : ''}
          </div>
          ${groups.pending.length ? groups.pending.map(row).join('') : '<p class="muted small">No pending teams.</p>'}
        </div>
        <div class="card">
          <h3>APPROVED (${groups.approved.length})</h3>
          ${groups.approved.length ? groups.approved.map(row).join('') : '<p class="muted small">None yet.</p>'}
          ${groups.eliminated.length ? `<div class="divider"></div><h3>ELIMINATED (${groups.eliminated.length})</h3>${groups.eliminated.map(row).join('')}` : ''}
          ${groups.disqualified.length ? `<div class="divider"></div><h3 style="color:var(--danger-red)">DISQUALIFIED (${groups.disqualified.length})</h3>${groups.disqualified.map(row).join('')}` : ''}
          ${groups.winners.length ? `<div class="divider"></div><h3>WINNERS</h3>${groups.winners.map(row).join('')}` : ''}
        </div>
      </div>`;

    document.querySelectorAll('[data-ap]').forEach(el =>
      el.onclick = () => this.approve(el.dataset.ap, true));
    document.querySelectorAll('[data-rv]').forEach(el =>
      el.onclick = () => this.approve(el.dataset.rv, false));
    document.querySelectorAll('[data-rq]').forEach(el =>
      el.onclick = () => this.requalifyTeam(el.dataset.rq));
    document.querySelectorAll('[data-dq]').forEach(el =>
      el.onclick = () => this.disqualifyTeam(el.dataset.dq));
    document.querySelectorAll('[data-flags]').forEach(el =>
      el.onclick = () => this.showFlags(el.dataset.flags));
    document.querySelectorAll('[data-del]').forEach(el =>
      el.onclick = () => this.deleteTeam(el.dataset.del));
    const apAll = document.getElementById('apAll');
    if (apAll) apAll.onclick = () => this.approveAll();
  },

  /* ---- SELECTION SHEET ---- */
  renderSelectionSheet(c) {
    const db = this.state;
    const s = db.session;

    const selectionQuestions = db.questions
      .filter(q => q.roundNumber === 0 && q.isActive)
      .sort((a, b) => a.order - b.order);

    const selectionTeams = db.teams.filter(t => {
      if (t.status === 'eliminated' && t.eliminatedInRound === 0) return true;
      if (t.status === 'active' || t.status === 'disqualified') return true;
      if (s.selectionAnswers && s.selectionAnswers[t.id]) return true;
      return false;
    });

    const header = `
      <div class="card mb">
        <h3>SELECTION ROUND — FULL ANSWER SHEET</h3>
        <p class="muted small">
          ${selectionQuestions.length} questions · ${selectionTeams.length} teams participated
          ${s.state === 'SELECTION' ? ' · <b style="color:var(--acid-green)">ROUND LIVE</b>' : ''}
        </p>
      </div>`;

    let summaryRows = '';
    selectionTeams.forEach(t => {
      const rec = (s.selectionAnswers || {})[t.id];
      const answers = rec ? rec.answers : {};
      const lockedCount = Object.values(answers).filter(a => a.locked).length;
      const correct = Object.values(answers).filter(a => a.locked && a.isCorrect).length;
      const wrong = Object.values(answers).filter(a => a.locked && !a.isCorrect && a.raw !== '__skip__').length;
      const skipped = Object.values(answers).filter(a => a.locked && a.raw === '__skip__').length;
      const timeLeft = rec && rec.endsAt ? Math.max(0, Math.ceil((rec.endsAt - Date.now()) / 1000)) : 0;
      const flagCount = (t.flags || []).length;

      let status = t.status;
      if (t.status === 'eliminated' && t.eliminatedInRound === 0) status = 'did not qualify';
      if (t.status === 'active' && s.state === 'SELECTION') status = 'in play';

      summaryRows += `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px 0"><b>${esc(t.teamName)}</b></td>
          <td style="font-family:monospace;padding:10px 0">${t.points.r0 || 0}</td>
          <td style="padding:10px 0"><span style="color:var(--acid-green)">${correct}✓</span> / <span style="color:var(--danger-red)">${wrong}✗</span> / <span class="muted">${skipped}skip</span></td>
          <td style="padding:10px 0">${lockedCount}/${selectionQuestions.length}</td>
          <td style="font-family:monospace;padding:10px 0">${fmtClock(timeLeft)}</td>
          <td style="padding:10px 0">${flagCount ? '<span style="color:var(--danger-red)">⚠ ' + flagCount + '</span>' : '—'}</td>
          <td style="padding:10px 0">${esc(status)}</td>
        </tr>`;
    });

    let questionBlocks = '';
    selectionQuestions.forEach((q, qi) => {
      const rows = selectionTeams.map(t => {
        const rec = (s.selectionAnswers || {})[t.id];
        const a = rec && rec.answers ? rec.answers[q.id] : null;
        let cell = '<span class="muted">—</span>';
        if (a) {
          if (!a.locked) {
            cell = '<span style="color:var(--warn-yellow)">(not submitted)</span>';
          } else if (a.raw === '__skip__') {
            cell = '<span class="muted">skipped</span>';
          } else {
            const cls = a.isCorrect ? 'style="color:var(--acid-green);font-weight:700"' : 'style="color:var(--danger-red)"';
            cell = `<span ${cls}>${esc(String(a.raw))}</span> <span class="muted small">(${a.pts > 0 ? '+' : ''}${a.pts})</span>`;
          }
        }
        return `<tr style="border-bottom:1px solid rgba(184,196,214,.08)">
          <td style="padding:8px 0">${esc(t.teamName)}</td>
          <td style="padding:8px 0">${cell}</td>
        </tr>`;
      }).join('');

      questionBlocks += `
        <div class="card mb">
          <h3 style="margin:0 0 6px">Q${qi + 1} · ${esc(q.text)}</h3>
          <p class="small" style="margin:0 0 12px">Correct answer: <b style="color:var(--acid-green)">${esc(q.correctAnswer)}</b></p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:6px 0;color:var(--mut);font-weight:600;width:40%">Team</th>
                <th style="text-align:left;padding:6px 0;color:var(--mut);font-weight:600">Answer</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="2" class="muted small">No teams</td></tr>'}</tbody>
          </table>
        </div>`;
    });

    c.innerHTML = `
      ${header}
      <div class="card mb">
        <h3>TEAM SUMMARY</h3>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:700px">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Team</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Points</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Result</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Locked</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Time left</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Flags</th>
                <th style="text-align:left;padding:8px 0;color:var(--mut);font-weight:600">Status</th>
              </tr>
            </thead>
            <tbody>${summaryRows || '<tr><td colspan="7" class="muted small">No teams participated</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="card mb"><h3>PER-QUESTION BREAKDOWN</h3></div>
      ${questionBlocks || '<p class="muted small">No selection questions.</p>'}
    `;
  },

  renderBank(c) {
    const rounds = [0, 1, 2, 3, 4, 5];
    let left = '';
    rounds.forEach(r => {
      const qs = this.roundQuestions(r);
      const title = r === 0 ? 'SELECTION' : ('ROUND ' + r);
      left += `
        <div class="card mb">
          <div class="flex-between mb">
            <h3 style="margin:0">${title} (${qs.length})</h3>
            <button class="btn sm primary" data-add="${r}">+ ADD</button>
          </div>
          ${qs.length ? qs.map((q, i) => this.qRow(q, i, qs.length)).join('') : '<p class="muted small">No questions.</p>'}
        </div>`;
    });
    c.innerHTML = `<div class="grid two"><div>${left}</div>
      <div><div class="card" id="qe"><h3>EDIT PANEL</h3><p class="muted small">Click a question to edit.</p></div></div></div>`;

    document.querySelectorAll('[data-add]').forEach(el =>
      el.onclick = () => this.openEditor(+el.dataset.add, null));
    document.querySelectorAll('[data-edit]').forEach(el =>
      el.onclick = () => {
        const q = this.state.questions.find(x => x.id === el.dataset.edit);
        if (q) this.openEditor(q.roundNumber, q);
      });
    document.querySelectorAll('[data-del]').forEach(el =>
      el.onclick = () => {
        if (confirm('Delete this question?')) this.deleteQuestion(el.dataset.del);
      });
    document.querySelectorAll('[data-up]').forEach(el =>
      el.onclick = () => this.moveQuestion(el.dataset.up, 'up'));
    document.querySelectorAll('[data-dn]').forEach(el =>
      el.onclick = () => this.moveQuestion(el.dataset.dn, 'down'));
  },

  qRow(q, idx, total) {
    let preview = '';
    if (q.type === 'mcq') preview = `MCQ · <b style="color:var(--acid-green)">${esc(q.options[q.correctAnswer])}</b>`;
    else if (q.type === 'saq') preview = `SAQ · <b style="color:var(--acid-green)">${esc(q.correctAnswer)}</b>`;
    else preview = `Numeric · <b style="color:var(--acid-green)">${esc(q.correctAnswer)} ${esc(q.unit || '')}</b>`;
    return `
      <div class="qrow">
        <div style="font-family:monospace;font-weight:800;color:var(--mut);min-width:20px">${idx + 1}</div>
        <div class="qbody">
          <div class="qtext">${esc(q.text)}</div>
          <div class="qmeta">${preview}${q.timeLimitSec ? ' · ⏱ ' + q.timeLimitSec + 's' : ''}</div>
        </div>
        <div class="qops">
          <button class="iconbtn" data-up="${q.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="iconbtn" data-dn="${q.id}" ${idx === total - 1 ? 'disabled' : ''}>▼</button>
          <button class="iconbtn" data-edit="${q.id}">✎</button>
          <button class="iconbtn danger" data-del="${q.id}">✕</button>
        </div>
      </div>`;
  },

  openEditor(roundNumber, existing) {
    const panel = document.getElementById('qe');
    if (!panel) return;
    const isEdit = !!existing;
    const q = existing || {
      text: '',
      type: roundNumber === 0 ? 'saq' : (roundNumber === 1 ? 'closest_guess' : 'mcq'),
      options: ['', '', '', ''],
      correctAnswer: roundNumber === 0 ? '' : 0,
      timeLimitSec: roundNumber === 0 ? 0 : (roundNumber === 4 || roundNumber === 5 ? 15 : roundNumber === 2 ? 20 : 30),
      points: roundNumber === 0 ? 2 : (roundNumber === 5 ? 20 : 10),
      unit: ''
    };
    const titlePrefix = roundNumber === 0 ? 'SELECTION' : ('ROUND ' + roundNumber);

    panel.innerHTML = `
      <h3>${isEdit ? 'EDIT' : 'ADD — ' + titlePrefix}</h3>
      <div class="field"><label>QUESTION TEXT</label><textarea id="qet" rows="3">${esc(q.text)}</textarea></div>
      <div class="field"><label>TYPE</label>
        <select id="qey" ${isEdit ? 'disabled' : ''}>
          <option value="saq" ${q.type === 'saq' ? 'selected' : ''}>Short Answer (text/number)</option>
          <option value="closest_guess" ${q.type === 'closest_guess' ? 'selected' : ''}>Closest Guess (numeric)</option>
          <option value="mcq" ${q.type === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
        </select>
      </div>
      <div id="qef"></div>
      <div class="grid two" style="gap:10px">
        <div class="field"><label>TIME (sec)</label><input id="qetm" type="number" min="0" value="${q.timeLimitSec}"></div>
        <div class="field"><label>POINTS</label><input id="qept" type="number" min="1" value="${q.points}"></div>
      </div>
      <div class="flex mt">
        <button class="btn primary" id="qes">${isEdit ? 'SAVE' : 'ADD'}</button>
        <button class="btn ghost" id="qec">CANCEL</button>
      </div>`;

    const renderFields = () => {
      const t = document.getElementById('qey').value;
      const f = document.getElementById('qef');
      if (t === 'mcq') {
        f.innerHTML = `<div class="field"><label>OPTIONS · RADIO = CORRECT</label>
          ${[0, 1, 2, 3].map(i => `
            <div class="flex" style="margin-bottom:6px">
              <input type="radio" name="qer" value="${i}" ${q.correctAnswer == i ? 'checked' : ''} style="width:auto;flex-shrink:0">
              <input class="qeo" data-i="${i}" value="${esc(q.options && q.options[i] ? q.options[i] : '')}" placeholder="Option ${String.fromCharCode(65 + i)}">
            </div>`).join('')}
        </div>`;
      } else if (t === 'saq') {
        f.innerHTML = `<div class="field">
          <label>CORRECT ANSWER (case-insensitive, auto-uppercase)</label>
          <input id="qea" type="text" value="${esc(q.correctAnswer == null ? '' : q.correctAnswer)}"
                 placeholder="e.g. NEWTON" autocomplete="off" maxlength="60" style="text-transform:uppercase">
        </div>`;
      } else {
        f.innerHTML = `<div class="grid two" style="gap:10px">
          <div class="field"><label>ANSWER</label><input id="qea" type="number" value="${q.correctAnswer}"></div>
          <div class="field"><label>UNIT</label><input id="qeu" value="${esc(q.unit || '')}"></div>
        </div>`;
      }
    };
    renderFields();
    document.getElementById('qey').onchange = renderFields;

    document.getElementById('qec').onclick = () => {
      panel.innerHTML = '<h3>EDIT PANEL</h3><p class="muted small">Click a question to edit.</p>';
    };

    document.getElementById('qes').onclick = () => {
      const text = document.getElementById('qet').value.trim();
      if (!text) return toast('⚠ Question text required');
      const type = document.getElementById('qey').value;
      const tm = +document.getElementById('qetm').value || (type === 'saq' ? 0 : 30);
      const pts = +document.getElementById('qept').value || (type === 'saq' ? 2 : 10);
      let options, ca, unit = '';

      if (type === 'mcq') {
        options = Array.from(document.querySelectorAll('.qeo')).map(el => el.value.trim());
        if (options.some(o => !o)) return toast('⚠ All options required');
        const sel = document.querySelector('input[name="qer"]:checked');
        ca = sel ? +sel.value : 0;
      } else if (type === 'saq') {
        ca = document.getElementById('qea').value.trim().toUpperCase();
        if (!ca) return toast('⚠ Correct answer required');
      } else {
        ca = Number(document.getElementById('qea').value);
        if (!isFinite(ca)) return toast('⚠ Valid number required');
        unit = document.getElementById('qeu').value.trim();
      }

      if (isEdit) {
        this.editQuestion(existing.id, { text, options, correctAnswer: ca, unit, timeLimitSec: tm, points: pts });
        toast('✓ Saved');
      } else {
        this.addQuestion({ roundNumber, text, type, options, correctAnswer: ca, unit, timeLimitSec: tm, points: pts });
        toast('✓ Added');
      }
      panel.innerHTML = '<h3>EDIT PANEL</h3><p class="muted small">Click a question to edit.</p>';
    };
  },

  renderBoard(c) {
    c.innerHTML = '<div class="card"><h3>FULL LEADERBOARD</h3><div id="ab2"></div></div>';
    this.renderLeaderboard(document.getElementById('ab2'), true);
  },

  renderLeaderboard(el, showAll) {
    if (!el) return;
    const lb = this.leaderboard(showAll);
    if (!lb.length) { el.innerHTML = '<p class="muted small">No teams in play yet.</p>'; return; }
    el.innerHTML = lb.map((t, i) => {
      const cls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const parts = [];
      if (t.points.r0) parts.push('R0 ' + t.points.r0);
      if (t.points.r1) parts.push('R1 ' + t.points.r1);
      if (t.points.r2) parts.push('R2 ' + t.points.r2);
      if (t.points.r3) parts.push('R3 ' + t.points.r3);
      if (t.points.r4) parts.push('R4 ' + t.points.r4);
      if (t.points.r5) parts.push('R5 ' + t.points.r5);
      const breakdown = parts.length ? parts.join(' · ') : 'no points yet';
      return `<div class="lb-row ${cls}">
        <div class="rank">${i + 1}</div>
        <div class="tname">${esc(t.teamName)}
          <div class="small muted">${breakdown}</div>
        </div>
        <div class="pts">${t.points.total || 0}</div>
      </div>`;
    }).join('');
  }
};