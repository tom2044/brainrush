'use strict';

/* ============================================================
   BRAINRUSH — Admin View
   ============================================================ */

const Admin = {
  tab: 'control',
  state: null,

  setState(s) { this.state = s; render(); },

  /* ---- Actions ---- */
  approve(teamId, yes)    { Socket.emit('admin:approveTeam', { teamId, yes }); },
  deleteTeam(teamId) {
  if (!confirm('Delete this team permanently? This cannot be undone.')) return;
  Socket.emit('admin:deleteTeam', { teamId }, (r) => {
    if (r && !r.ok) toast('⚠ ' + (r.reason || 'Delete failed'));
    else toast('✓ Team removed');
  });
},
  approveAll()            { Socket.emit('admin:approveAll'); },
  sendToInstructions()    { Socket.emit('admin:sendToInstructions'); },
  closeInstructions()     { Socket.emit('admin:closeInstructions'); },
  startRound(n)           { Socket.emit('admin:startRound', { round: n }, (r) => {
                              if (r && !r.ok) toast('⚠ ' + (r.reason || 'Cannot start'));
                            }); },
  nextQuestion()          { Socket.emit('admin:nextQuestion'); },
  forceReveal()           { Socket.emit('admin:forceReveal'); },
  endSession()            { Socket.emit('admin:endSession'); },
  resetSession()          { Socket.emit('admin:resetSession'); },
  clearAll()              { if (confirm('Delete ALL data?')) Socket.emit('admin:clearAll'); },
  backLobby()             { Socket.emit('admin:closeInstructions'); },
  addQuestion(o)          { Socket.emit('admin:question:add', o); },
  editQuestion(id, patch) { Socket.emit('admin:question:edit', { id, patch }); },
  deleteQuestion(id)      { Socket.emit('admin:question:delete', { id }); },
  moveQuestion(id, dir)   { Socket.emit('admin:question:move', { id, direction: dir }); },

  /* ---- Helpers ---- */
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
      ? db.teams.filter(t => t.status !== 'registered').map(t => t.id)
      : (db.session.activeTeamIds.length ? db.session.activeTeamIds
          : db.teams.filter(t => t.status !== 'registered').map(t => t.id));
    return db.teams.filter(t => ids.includes(t.id)).slice()
      .sort((a, b) => (b.points.total || 0) - (a.points.total || 0)
                   || (a.latency || 0) - (b.latency || 0));
  },

  /* ---- Render ---- */
  render(root) {
    if (!this.state) { root.innerHTML = '<div class="wait-screen"><p>Loading…</p></div>'; return; }
    const db = this.state;
    const s = db.session;
    const labels = {
      LOBBY:'Lobby', INSTRUCTIONS:'Instructions', ROUND_INTRO:'Round Intro',
      QUESTION_ACTIVE:'Question Live', QUESTION_REVEAL:'Reveal',
      ROUND_END:'Round End', FINISHED:'Finished'
    };

    root.innerHTML = `
      <div class="app">
        <div class="topbar">
          <div class="brand"><span class="dot"></span>BRAINRUSH <span class="badge info">ADMIN</span></div>
          <div class="flex">
            <span class="badge ${s.state === 'QUESTION_ACTIVE' ? 'live' : ''}">${labels[s.state] || s.state}</span>
            <span class="badge">R${s.round || '-'} · Q${s.qIndex + 1}</span>
            <button class="btn sm ghost" id="exit">EXIT</button>
          </div>
        </div>
        <div class="main">
          <div class="tabs">
            <button class="tab ${this.tab === 'control' ? 'active' : ''}" data-tab="control">🎮 CONTROL</button>
            <button class="tab ${this.tab === 'teams' ? 'active' : ''}" data-tab="teams">👥 TEAMS (${db.teams.length})</button>
            <button class="tab ${this.tab === 'bank' ? 'active' : ''}" data-tab="bank">📚 Q-BANK (${db.questions.length})</button>
            <button class="tab ${this.tab === 'board' ? 'active' : ''}" data-tab="board">🏆 BOARD</button>
          </div>
          <div id="ac"></div>
        </div>
      </div>`;

    document.getElementById('exit').onclick = () => App.exitRole();
    document.querySelectorAll('.tab').forEach(el => el.onclick = () => {
      this.tab = el.dataset.tab; render();
    });

    const c = document.getElementById('ac');
    if (!c) return;
    if (this.tab === 'control') this.renderControl(c);
    else if (this.tab === 'teams') this.renderTeams(c);
    else if (this.tab === 'bank') this.renderBank(c);
    else if (this.tab === 'board') this.renderBoard(c);
  },

  renderControl(c) {
    const db = this.state;
    const s = db.session;
    const approved = db.teams.filter(t => t.status === 'approved' || t.status === 'active');
    const canStart = approved.length >= 2 &&
      (s.state === 'LOBBY' || s.state === 'ROUND_END' || s.state === 'FINISHED');

    let controls = '';
    if (s.state === 'LOBBY') {
      controls = `<div class="flex mb">
        <button class="btn primary" id="instr">📖 INSTRUCTIONS</button>
        <button class="btn ${canStart ? 'good' : ''}" id="start1" ${canStart ? '' : 'disabled'}>
          ▶ START ROUND 1 (${approved.length})</button>
      </div>`;
    } else if (s.state === 'INSTRUCTIONS') {
      controls = `<p class="muted mb">Teams reading instructions…</p>
        <div class="flex">
          <button class="btn ${canStart ? 'good' : ''}" id="start1" ${canStart ? '' : 'disabled'}>▶ START ROUND 1</button>
          <button class="btn ghost" id="closeInstr">CLOSE</button>
        </div>`;
    } else if (s.state === 'ROUND_INTRO') {
      controls = '<p class="muted">Round intro — auto-advancing…</p>';
    } else if (s.state === 'QUESTION_ACTIVE') {
      controls = `<p class="muted mb">Question live.</p>
        <button class="btn warn block" id="forceReveal">⏭ FORCE REVEAL</button>`;
    } else if (s.state === 'QUESTION_REVEAL') {
      controls = `<p class="muted mb">Reveal showing…</p>
        <button class="btn primary block" id="skipReveal">⏩ NEXT QUESTION</button>`;
    } else if (s.state === 'ROUND_END') {
      const next = s.round + 1;
      controls = `<p class="muted mb">Round ${s.round} complete. Survivors: <b>${s.activeTeamIds.length}</b></p>
        <div class="flex">
          ${next <= 4 ? `<button class="btn primary" id="startN" data-r="${next}">▶ START ROUND ${next}</button>` : ''}
          <button class="btn bad" id="endNow">🏁 END SESSION</button>
        </div>`;
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
              <div class="stat"><span class="v">R${s.round || '-'}</span><span class="l">Round</span></div>
              <div class="stat"><span class="v">Q${s.qIndex + 1}</span><span class="l">Index</span></div>
            </div>
          </div>
          <div class="card">
            <h3>DANGER ZONE</h3>
            <button class="btn bad block sm" id="clearAll">🗑 CLEAR ALL</button>
          </div>
        </div>
        <div>
          <div class="card mb"><h3>CURRENT QUESTION</h3>${q ? this.adminQuestionHTML(q, s) : '<p class="muted">No active question.</p>'}</div>
          <div class="card"><h3>LIVE LEADERBOARD</h3><div id="alb"></div></div>
        </div>
      </div>`;

    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('instr',       () => this.sendToInstructions());
    bind('start1',      () => this.startRound(1));
    bind('closeInstr',  () => this.closeInstructions());
    bind('forceReveal', () => this.forceReveal());
    bind('skipReveal',  () => this.nextQuestion());
    bind('endNow',      () => this.endSession());
    bind('reset',       () => this.resetSession());
    bind('backLobby',   () => this.backLobby());
    bind('clearAll',    () => this.clearAll());

    document.querySelectorAll('#ac [data-r]').forEach(el => {
      el.onclick = () => this.startRound(+el.dataset.r);
    });

    this.renderLeaderboard(document.getElementById('alb'), false);
  },

  adminQuestionHTML(q, s) {
    let body = `<div style="font-size:16px;font-weight:600;margin-bottom:12px">${esc(q.text)}</div>`;
    if (q.type === 'mcq') {
      body += `<div class="small muted mb">Correct: <b style="color:var(--acid-green)">${esc(q.options[q.correctAnswer])}</b></div>`;
      body += '<ol style="margin-left:18px;color:var(--mut);font-size:13px">' +
        q.options.map((o, i) =>
          `<li style="${i === q.correctAnswer ? 'color:var(--acid-green);font-weight:700' : ''}">${esc(o)}</li>`
        ).join('') + '</ol>';
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
    if (s.round === 4 && s.buzzerLockedByTeamId) {
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
      pending:    db.teams.filter(t => t.status === 'registered'),
      approved:   db.teams.filter(t => t.status === 'approved' || t.status === 'active'),
      eliminated: db.teams.filter(t => t.status === 'eliminated'),
      winners:    db.teams.filter(t => t.status === 'winner')
    };

    const row = (t) => {
      let tag = '<span class="tag no">Pending</span>';
      if (t.status === 'approved')   tag = '<span class="tag ok">Approved</span>';
      if (t.status === 'active')     tag = '<span class="tag ok">In Play</span>';
      if (t.status === 'eliminated') tag = `<span class="tag out">Out R${t.eliminatedInRound || '?'}</span>`;
      if (t.status === 'winner')     tag = `<span class="tag ok">#${t.finalRank || '?'}</span>`;
      return `
        <div class="team-row ${t.status !== 'registered' ? 'approved' : ''} ${t.status === 'eliminated' ? 'eliminated' : ''}">
          <div>
            <div class="name">${esc(t.teamName)}</div>
            <div class="roll">${esc(t.students[0].name)} (${esc(t.students[0].rollNumber)}) · ${esc(t.students[1].name)} (${esc(t.students[1].rollNumber)})</div>
          </div>
          ${tag}
          <div class="row-actions">
            ${t.status === 'registered' ? `<button class="btn sm good" data-ap="${t.id}">APPROVE</button>` : ''}
            ${(t.status === 'approved' || t.status === 'active') ? `<button class="btn sm ghost" data-rv="${t.id}">REVOKE</button>` : ''}
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
          ${groups.winners.length ? `<div class="divider"></div><h3>WINNERS</h3>${groups.winners.map(row).join('')}` : ''}
        </div>
      </div>`;

    document.querySelectorAll('[data-ap]').forEach(el =>
      el.onclick = () => this.approve(el.dataset.ap, true));
    document.querySelectorAll('[data-rv]').forEach(el =>
      el.onclick = () => this.approve(el.dataset.rv, false));
      document.querySelectorAll('[data-del]').forEach(el =>
  el.onclick = () => this.deleteTeam(el.dataset.del));
    const apAll = document.getElementById('apAll');
    if (apAll) apAll.onclick = () => this.approveAll();
  },

  renderBank(c) {
    const rounds = [1, 2, 3, 4];
    let left = '';
    rounds.forEach(r => {
      const qs = this.roundQuestions(r);
      left += `
        <div class="card mb">
          <div class="flex-between mb">
            <h3 style="margin:0">ROUND ${r} (${qs.length})</h3>
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
    else preview = `Numeric · <b style="color:var(--acid-green)">${esc(q.correctAnswer)} ${esc(q.unit || '')}</b>`;
    return `
      <div class="qrow">
        <div style="font-family:monospace;font-weight:800;color:var(--mut);min-width:20px">${idx + 1}</div>
        <div class="qbody">
          <div class="qtext">${esc(q.text)}</div>
          <div class="qmeta">${preview} · ⏱ ${q.timeLimitSec}s</div>
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
      text: '', type: roundNumber === 1 ? 'closest_guess' : 'mcq',
      options: ['', '', '', ''], correctAnswer: 0,
      timeLimitSec: roundNumber === 4 ? 15 : roundNumber === 2 ? 20 : 30,
      points: roundNumber === 4 ? 20 : 10, unit: ''
    };

    panel.innerHTML = `
      <h3>${isEdit ? 'EDIT' : 'ADD — ROUND ' + roundNumber}</h3>
      <div class="field"><label>QUESTION TEXT</label><textarea id="qet" rows="3">${esc(q.text)}</textarea></div>
      <div class="field"><label>TYPE</label>
        <select id="qey" ${isEdit ? 'disabled' : ''}>
          <option value="closest_guess" ${q.type === 'closest_guess' ? 'selected' : ''}>Closest Guess (numeric)</option>
          <option value="mcq" ${q.type === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
        </select>
      </div>
      <div id="qef"></div>
      <div class="grid two" style="gap:10px">
        <div class="field"><label>TIME (sec)</label><input id="qetm" type="number" min="5" value="${q.timeLimitSec}"></div>
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
      const tm = +document.getElementById('qetm').value || 30;
      const pts = +document.getElementById('qept').value || 10;
      let options, ca, unit = '';
      if (type === 'mcq') {
        options = Array.from(document.querySelectorAll('.qeo')).map(el => el.value.trim());
        if (options.some(o => !o)) return toast('⚠ All options required');
        const sel = document.querySelector('input[name="qer"]:checked');
        ca = sel ? +sel.value : 0;
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
      return `<div class="lb-row ${cls}">
        <div class="rank">${i + 1}</div>
        <div class="tname">${esc(t.teamName)}
          <div class="small muted">R1 ${t.points.r1 || 0} · R2 ${t.points.r2 || 0} · R3 ${t.points.r3 || 0} · R4 ${t.points.r4 || 0}</div>
        </div>
        <div class="pts">${t.points.total || 0}</div>
      </div>`;
    }).join('');
  }
};