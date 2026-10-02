'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');

/* ============================================================
   CONFIG
   ============================================================ */
const CFG = {
  PORT: process.env.PORT || 4000,
  MAX_REGISTERED_TEAMS: 200,
  MIN_TEAMS_TO_START: 2,

  SELECTION_Q_COUNT: 10,
  SELECTION_TOTAL_MS: 10 * 60 * 1000,
  SELECTION_CORRECT: 2,
  SELECTION_WRONG: -1,
  SELECTION_QUALIFY: 10,

  R1_SCALE: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  R2_SCALE: [10, 8, 6, 5, 4, 3, 2, 1, 1, 1],
  R3_CORRECT: 10, R3_STEAL: 15, R3_FAIL: -5,
  R4_CORRECT: 10, R4_WRONG: -5,
  R5_CORRECT: 20, R5_WRONG: -10,

  REVEAL_MS: 4000, BUZZ_WINDOW_MS: 8000, CHALLENGE_MS: 10000,
  INSTR_SEC: 300, ROUND_INTRO_MS: 3000, TICK_MS: 200,

  ROUND_CUTS: { 1: 2, 2: 2, 3: 2, 4: 2 },

  DISQUALIFY_GRACE_MS: 5000,
};

/* ============================================================
   ADMIN AUTH
   ============================================================ */
const ADMINS = [
  { id: 'admin1', name: 'Tamal',    mobile: '9695848092' },
  { id: 'admin2', name: 'Joy',      mobile: '8293309467' },
  { id: 'admin3', name: 'Snehasis', mobile: '9732257776' }
];
const MAX_ADMIN_SLOTS = 3;
const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_GRACE_MS = 5 * 60 * 1000;

const otpStore = new Map();
const adminSessions = new Map();
const adminByMobile = new Map();

function findAdminByMobile(mobile) {
  return ADMINS.find(a => a.mobile === mobile) || null;
}
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function activeAdminCount() { return adminSessions.size; }
function adminSlotsAvailable() { return Math.max(0, MAX_ADMIN_SLOTS - activeAdminCount()); }
function pruneStaleSessions() {
  const now = Date.now();
  for (const [token, sess] of adminSessions.entries()) {
    if (!sess.socketId && (now - sess.lastSeen) > SESSION_GRACE_MS) {
      adminSessions.delete(token);
      for (const [m, t] of adminByMobile.entries()) {
        if (t === token) adminByMobile.delete(m);
      }
    }
  }
}
setInterval(pruneStaleSessions, 10000);

function normalizeAnswer(s) {
  return String(s == null ? '' : s).toUpperCase().trim();
}
function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   QUESTIONS
   ============================================================ */
function seedQuestions() {
  const out = [];

  const SEL = [
    ['Full form of CPU', 'CENTRAL PROCESSING UNIT'],
    ['Unit of force (SI)', 'NEWTON'],
    ['H2O is the chemical formula for?', 'WATER'],
    ['Number of sides in a hexagon?', '6'],
    ['Largest planet in our solar system?', 'JUPITER'],
    ['Speed of light (km/s, rounded)?', '300000'],
    ['Chemical symbol for iron?', 'FE'],
    ['Square root of 144?', '12'],
    ['First man on the moon (last name)?', 'ARMSTRONG'],
    ['Boiling point of water at sea level in °C?', '100']
  ];
  SEL.forEach(([t, a], i) => out.push({
    id: 'selq' + (i + 1), roundNumber: 0, order: i + 1, type: 'saq',
    text: t, correctAnswer: normalizeAnswer(a),
    unit: '', points: 2, timeLimitSec: 0, isActive: true
  }));

  const R1 = [
    ['Height of the Statue of Unity (m)', 182, 'm'],
    ['Year the first iPhone was released', 2007, ''],
    ['Bones in an adult human body', 206, ''],
    ['Population of India 2024 (crores)', 144, 'crore'],
    ['Average Earth-Sun distance (million km)', 150, 'M km'],
    ['Keys on a standard piano', 88, '']
  ];
  R1.forEach(([t, a, u], i) => out.push({
    id: 'r1q' + (i + 1), roundNumber: 1, order: i + 1, type: 'closest_guess',
    text: t, correctAnswer: a, unit: u, points: 10, timeLimitSec: 45, isActive: true
  }));

  const R2 = [
    ['Capital of Australia?', ['Sydney', 'Canberra', 'Melbourne', 'Perth'], 1],
    ['Which planet is the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1],
    ['Chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 2],
    ['Who wrote "Romeo and Juliet"?', ['Dickens', 'Shakespeare', 'Austen', 'Twain'], 1],
    ['Largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
    ['How many continents?', ['5', '6', '7', '8'], 2],
    ['H2O is the formula for...', ['Salt', 'Water', 'Sugar', 'Oxygen'], 1],
    ['Fastest land animal?', ['Lion', 'Cheetah', 'Horse', 'Greyhound'], 1],
    ['Currency of Japan?', ['Won', 'Yuan', 'Yen', 'Ringgit'], 2],
    ['Who painted the Mona Lisa?', ['Michelangelo', 'Raphael', 'da Vinci', 'Donatello'], 2]
  ];
  R2.forEach(([t, o, a], i) => out.push({
    id: 'r2q' + (i + 1), roundNumber: 2, order: i + 1, type: 'mcq',
    text: t, options: o, correctAnswer: a, points: 10, timeLimitSec: 20, isActive: true
  }));

  const R3 = [
    ['Largest planet?', ['Saturn', 'Jupiter', 'Neptune', 'Earth'], 1],
    ['Longest river in the world?', ['Amazon', 'Yangtze', 'Nile', 'Mississippi'], 2],
    ['Smallest prime number?', ['0', '1', '2', '3'], 2],
    ['Square root of 144?', ['11', '12', '13', '14'], 1],
    ['Who invented the telephone?', ['Edison', 'Tesla', 'Bell', 'Marconi'], 2],
    ['Boiling point of water at sea level (C)?', ['90', '95', '100', '105'], 2],
    ['Sides on a hexagon?', ['5', '6', '7', '8'], 1],
    ['Author of Harry Potter?', ['Tolkien', 'Rowling', 'Dahl', 'Lewis'], 1],
    ['Gas plants primarily absorb?', ['Oxygen', 'Nitrogen', 'CO2', 'Hydrogen'], 2],
    ['Capital of Canada?', ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'], 2],
    ['7 x 8 = ?', ['54', '56', '58', '64'], 1],
    ['WWII ended in...', ['1943', '1944', '1945', '1946'], 2],
    ['Largest hot desert?', ['Gobi', 'Kalahari', 'Sahara', 'Arabian'], 2],
    ['Chemical symbol for sodium?', ['So', 'Sd', 'Na', 'Ni'], 2],
    ['Minutes in a day?', ['1200', '1380', '1440', '1500'], 2],
    ['Hardest natural substance?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2],
    ['First man on the moon?', ['Aldrin', 'Gagarin', 'Armstrong', 'Collins'], 2],
    ['CPU stands for?', ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Central Processor Union'], 1]
  ];
  R3.forEach(([t, o, a], i) => out.push({
    id: 'r3q' + (i + 1), roundNumber: 3, order: i + 1, type: 'mcq',
    text: t, options: o, correctAnswer: a, points: 10, timeLimitSec: 30, isActive: true
  }));

  const R4 = [
    ['2 + 2 x 2 = ?', ['4', '6', '8', '10'], 1],
    ['Capital of India?', ['Mumbai', 'Delhi', 'Kolkata', 'Chennai'], 1],
    ['Largest mammal?', ['Elephant', 'Blue whale', 'Giraffe', 'Hippo'], 1],
    ['9 x 9 = ?', ['72', '79', '81', '89'], 2],
    ['Largest country by area?', ['Canada', 'China', 'USA', 'Russia'], 3],
    ['Chemical symbol for iron?', ['Ir', 'In', 'Fe', 'Fr'], 2],
    ['Colors in a rainbow?', ['5', '6', '7', '8'], 2],
    ['Square root of 225?', ['12', '13', '14', '15'], 3],
    ['Planet with the most moons?', ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], 1],
    ['Theory of relativity by?', ['Newton', 'Einstein', 'Bohr', 'Hawking'], 1]
  ];
  R4.forEach(([t, o, a], i) => out.push({
    id: 'r4q' + (i + 1), roundNumber: 4, order: i + 1, type: 'mcq',
    text: t, options: o, correctAnswer: a, points: 10, timeLimitSec: 10, isActive: true
  }));

  const R5 = [
    ['15 + 27 = ?', ['40', '41', '42', '43'], 2],
    ['Capital of Japan?', ['Osaka', 'Kyoto', 'Tokyo', 'Nagoya'], 2],
    ['Largest ocean?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
    ['Square root of 169?', ['11', '12', '13', '14'], 2],
    ['Author of "Origin of Species"?', ['Newton', 'Darwin', 'Einstein', 'Hawking'], 1],
    ['Chemical symbol for silver?', ['Si', 'Ag', 'Au', 'Al'], 1],
    ['Number of players in a cricket team?', ['9', '10', '11', '12'], 2],
    ['Smallest continent?', ['Europe', 'Australia', 'Antarctica', 'South America'], 1],
    ['Largest internal organ in human body?', ['Heart', 'Liver', 'Lungs', 'Kidney'], 1],
    ['Value of pi (2 decimal places)?', ['3.12', '3.14', '3.16', '3.18'], 1]
  ];
  R5.forEach(([t, o, a], i) => out.push({
    id: 'r5q' + (i + 1), roundNumber: 5, order: i + 1, type: 'mcq',
    text: t, options: o, correctAnswer: a, points: 20, timeLimitSec: 15, isActive: true
  }));

  return out;
}

/* ============================================================
   OPTION SHUFFLE (per round, same for all teams)
   ============================================================ */
function shuffledOptionsMap(questions, round) {
  const map = {};
  if (round === 0 || round === 1) return map;
  questions
    .filter(q => q.roundNumber === round && q.isActive && q.type === 'mcq')
    .forEach(q => {
      const idx = [0, 1, 2, 3];
      const shuf = shuffleArr(idx);
      map[q.id] = {
        order: shuf,
        correctAnswer: shuf.indexOf(q.correctAnswer)
      };
    });
  return map;
}

/* ============================================================
   GAME ENGINE
   ============================================================ */
class Game {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.questions = seedQuestions();
    this.session = this.blankSession();
    this.teams = [];
    this.answers = [];
  }

  blankSession() {
    return {
      state: 'LOBBY',
      round: 0,
      qIndex: 0,
      currentQuestionId: null,
      activeTeamIds: [],
      activeTeamId: null,
      questionStartedAt: null,
      questionEndsAt: null,
      revealEndsAt: null,
      selectionAnswers: {},
      buzzerLockedByTeamId: null,
      buzzerLockEndsAt: null,
      challenge: null,
      lastReveal: null,
      instructionsEndsAt: null,
      optionShuffle: {},
      selectionOrder: {}
    };
  }

  roundQuestions(r) {
    return this.questions.filter(q => q.roundNumber === r && q.isActive)
      .sort((a, b) => a.order - b.order);
  }
  currentQuestion() {
    return this.roundQuestions(this.session.round)[this.session.qIndex] || null;
  }
  team(id) { return this.teams.find(t => t.id === id) || null; }

  leaderboard(ids) {
    const list = ids || this.session.activeTeamIds;
    return this.teams.filter(t => list.includes(t.id)).slice()
      .sort((a, b) => (b.points.total || 0) - (a.points.total || 0)
                   || (a.latency || 0) - (b.latency || 0));
  }

  addPoints(teamId, round, pts) {
    const t = this.team(teamId);
    if (!t) return;
    t.points['r' + round] = (t.points['r' + round] || 0) + pts;
    t.points.total = (t.points.total || 0) + pts;
  }

  allAnswered(q) {
    return this.session.activeTeamIds.every(tid =>
      this.answers.some(a => a.questionId === q.id && a.teamId === tid));
  }

  registerTeam({ teamName, students }) {
    if (!teamName || !Array.isArray(students) || students.length !== 2)
      return { ok: false, reason: 'Invalid team data' };
    if (this.teams.some(t => t.teamName.toLowerCase() === teamName.toLowerCase()))
      return { ok: false, reason: 'Team name already taken' };
    if (this.teams.length >= CFG.MAX_REGISTERED_TEAMS)
      return { ok: false, reason: 'Registration full' };
    const team = {
      id: uuid(), teamName, students, status: 'registered',
      points: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, total: 0 },
      latency: 0, eliminatedInRound: null, finalRank: null,
      instructionsAck: false, joinedAt: Date.now(), connected: true
    };
    this.teams.push(team);
    this.onChange();
    return { ok: true, teamId: team.id };
  }

  ackInstructions(teamId) {
    const t = this.team(teamId);
    if (t) { t.instructionsAck = true; this.onChange(); }
  }

  /* ---- SUBMIT ANSWER ---- */
  submitAnswer({ teamId, questionId, answer }) {
    const s = this.session;

    /* ===== SELECTION ROUND ===== */
    if (s.state === 'SELECTION') {
      let rec = s.selectionAnswers[teamId];
      if (!rec) {
        const t0 = this.team(teamId);
        if (t0 && (t0.status === 'active' || t0.status === 'approved')) {
          this._addToSelection(teamId);
          rec = s.selectionAnswers[teamId];
        } else {
          return { ok: false, reason: 'Not in selection' };
        }
      }

      if (rec.endsAt && Date.now() > rec.endsAt) {
        return { ok: false, reason: 'Your 10 minutes are up' };
      }

      // Locked already? (only blocks truly submitted answers, not skips)
      const existing = rec.answers[questionId];
      if (existing && existing.locked) {
        return { ok: false, reason: 'Already answered' };
      }

      const myOrder = s.selectionOrder[teamId] || [];
      const myQ = this.questions.find(q => q.id === questionId);
      if (!myQ || myOrder.indexOf(questionId) === -1) {
        return { ok: false, reason: 'Not your question' };
      }

      const answeredAt = Date.now();
      const norm = normalizeAnswer(answer);
      const ok = norm === myQ.correctAnswer;

      const pts = ok ? CFG.SELECTION_CORRECT : CFG.SELECTION_WRONG;

      // If they had a skip entry before, subtract 0 (skip was already 0 pts)
      rec.answers[questionId] = { raw: norm, isCorrect: ok, pts, at: answeredAt, locked: true };

      const t = this.team(teamId);
      if (t) {
        t.points.r0 = (t.points.r0 || 0) + pts;
        t.points.total = (t.points.total || 0) + pts;
        t.latency += (answeredAt - (rec.qStartedAt || answeredAt));
      }

      this.answers.push({
        id: uuid(), questionId, teamId, roundNumber: 0,
        rawAnswer: norm, receivedAt: answeredAt,
        latencyMs: answeredAt - (rec.qStartedAt || answeredAt),
        isCorrect: ok, pointsAwarded: pts,
        wasChallenge: false, guessDelta: null, wasSkip: false
      });

      // Auto-advance to next question
      rec.qIndex += 1;
      rec.qStartedAt = Date.now();

      return { ok: true, privateUpdate: true };
    }

    /* ===== OTHER ROUNDS (1–5) ===== */
    if (s.state !== 'QUESTION_ACTIVE') return { ok: false, reason: 'Not accepting' };
    const q = this.currentQuestion();
    if (!q || q.id !== questionId) return { ok: false, reason: 'Stale question' };
    if (!s.activeTeamIds.includes(teamId)) return { ok: false, reason: 'Not in play' };
    if (this.answers.some(a => a.questionId === questionId && a.teamId === teamId))
      return { ok: false, reason: 'Already answered' };

    if (s.round === 3) {
      if (s.challenge && s.challenge.questionId === questionId) {
        if (teamId !== s.challenge.challengerId) return { ok: false, reason: 'Not your turn' };
      } else if (teamId !== s.activeTeamId) return { ok: false, reason: 'Not your turn' };
    }
    if (s.round === 5 && s.buzzerLockedByTeamId !== teamId)
      return { ok: false, reason: 'Buzzer not yours' };

    // Un-shuffle MCQ answer back to original index
    let submittedAnswer = answer;
    if (q.type === 'mcq' && s.optionShuffle[q.id]) {
      const shuf = s.optionShuffle[q.id];
      submittedAnswer = shuf.order[answer];
    }

    const receivedAt = Date.now();
    const rec = {
      id: uuid(), questionId, teamId, roundNumber: s.round,
      rawAnswer: submittedAnswer, receivedAt,
      latencyMs: receivedAt - (s.questionStartedAt || receivedAt),
      isCorrect: false, pointsAwarded: 0,
      wasChallenge: !!(s.challenge && s.challenge.challengerId === teamId),
      guessDelta: null, wasSkip: false
    };
    this.answers.push(rec);
    const t = this.team(teamId);
    if (t) t.latency += rec.latencyMs;

    if (s.round === 1) {
      if (this.allAnswered(q)) this.finishQuestion();
      else this.onChange();
    } else if (s.round === 2) {
      if (this.allAnswered(q)) this.finishQuestion();
      else this.onChange();
    } else if (s.round === 3) this.evalR3Single(rec, q);
    else if (s.round === 4) {
      if (this.allAnswered(q)) this.finishQuestion();
      else this.onChange();
    } else if (s.round === 5) this.evalR5Single(rec, q);

    return { ok: true };
  }

  _addToSelection(teamId) {
    const s = this.session;
    if (s.state !== 'SELECTION') return;

    const t = this.team(teamId);
    if (!t) return;
    t.status = 'active';
    t.points.r0 = 0;
    t.latency = 0;

    delete s.selectionAnswers[teamId];

    const baseOrder = this.roundQuestions(0).map(q => q.id);
    const myOrder = shuffleArr(baseOrder);
    s.selectionOrder[teamId] = myOrder;

    const startAt = Date.now();
    s.selectionAnswers[teamId] = {
      qIndex: 0,
      answers: {},
      qStartedAt: startAt,
      endsAt: startAt + CFG.SELECTION_TOTAL_MS,
      finished: false
    };

    if (!s.activeTeamIds.includes(teamId)) s.activeTeamIds.push(teamId);
  }

  /* ---- SKIP (marks 0 pts, does NOT lock; can come back and submit) ---- */
  skipSelectionQuestion({ teamId }) {
    const s = this.session;
    if (s.state !== 'SELECTION') return { ok: false };
    let rec = s.selectionAnswers[teamId];
    if (!rec) {
      const t0 = this.team(teamId);
      if (t0 && (t0.status === 'active' || t0.status === 'approved')) {
        this._addToSelection(teamId);
        rec = s.selectionAnswers[teamId];
      } else {
        return { ok: false, reason: 'Not in selection' };
      }
    }
    if (rec.endsAt && Date.now() > rec.endsAt) {
      return { ok: false, reason: 'Your 10 minutes are up' };
    }
    const order = s.selectionOrder[teamId] || [];
    const qid = order[rec.qIndex];
    if (!qid) return { ok: false, reason: 'No more questions' };

    const existing = rec.answers[qid];
    if (!existing || !existing.locked) {
      rec.answers[qid] = { raw: '__skip__', isCorrect: false, pts: 0, at: Date.now(), locked: false, skipped: true };
    }
    rec.qIndex += 1;
    rec.qStartedAt = Date.now();
    return { ok: true, privateUpdate: true };
  }

  selectionGoBack({ teamId }) {
    const s = this.session;
    if (s.state !== 'SELECTION') return { ok: false };
    const rec = s.selectionAnswers[teamId];
    if (!rec) return { ok: false, reason: 'Not in selection' };
    if (rec.qIndex <= 0) return { ok: false, reason: 'At first question' };
    rec.qIndex -= 1;
    return { ok: true, privateUpdate: true };
  }

  selectionForward({ teamId }) {
    const s = this.session;
    if (s.state !== 'SELECTION') return { ok: false };
    const rec = s.selectionAnswers[teamId];
    if (!rec) return { ok: false, reason: 'Not in selection' };
    const order = s.selectionOrder[teamId] || [];
    if (rec.qIndex + 1 > order.length) return { ok: false, reason: 'No more questions' };
    rec.qIndex += 1;
    rec.qStartedAt = rec.qStartedAt || Date.now();
    return { ok: true, privateUpdate: true };
  }

  buzz({ teamId, questionId }) {
    const s = this.session;
    if (s.round !== 5 || s.state !== 'QUESTION_ACTIVE') return { ok: false };
    const q = this.currentQuestion();
    if (!q || q.id !== questionId) return { ok: false };
    if (!s.activeTeamIds.includes(teamId)) return { ok: false };
    if (s.buzzerLockedByTeamId) {
      const owner = this.team(s.buzzerLockedByTeamId);
      return { ok: false, reason: owner ? owner.teamName + ' buzzed first' : 'Already locked' };
    }
    s.buzzerLockedByTeamId = teamId;
    s.buzzerLockEndsAt = Date.now() + CFG.BUZZ_WINDOW_MS;
    this.onChange();
    return { ok: true };
  }

  challenge({ teamId, questionId }) {
    const s = this.session;
    if (s.round !== 3 || s.state !== 'QUESTION_ACTIVE') return { ok: false };
    const q = this.currentQuestion();
    if (!q || q.id !== questionId) return { ok: false };
    if (teamId === s.activeTeamId) return { ok: false, reason: 'Active team cannot challenge' };
    if (!s.activeTeamIds.includes(teamId)) return { ok: false };
    if (s.challenge && s.challenge.questionId === questionId)
      return { ok: false, reason: 'Already challenged' };
    s.challenge = { questionId, challengerId: teamId, endsAt: Date.now() + CFG.CHALLENGE_MS };
    this.onChange();
    return { ok: true };
  }

  approveTeam(teamId, yes) {
    const t = this.team(teamId);
    if (!t) return;
    if (yes && t.status === 'disqualified') return;

    const s = this.session;

    if (yes) {
      if (s.state === 'SELECTION') {
        this._addToSelection(teamId);
      } else {
        t.status = 'approved';
      }
    } else {
      t.status = 'registered';
      if (s.state === 'SELECTION') {
        delete s.selectionAnswers[teamId];
        delete s.selectionOrder[teamId];
        s.activeTeamIds = s.activeTeamIds.filter(id => id !== teamId);
      }
    }
    this.onChange();
  }

  approveAll() {
    this.teams.forEach(t => {
      if (t.status === 'registered') this.approveTeam(t.id, true);
    });
  }

  deleteTeam(teamId) {
    const idx = this.teams.findIndex(t => t.id === teamId);
    if (idx === -1) return { ok: false, reason: 'Team not found' };
    const teamName = this.teams[idx].teamName;
    this.teams.splice(idx, 1);
    this.answers = this.answers.filter(a => a.teamId !== teamId);
    this.session.activeTeamIds = this.session.activeTeamIds.filter(id => id !== teamId);
    delete this.session.selectionAnswers[teamId];
    delete this.session.selectionOrder[teamId];
    if (this.session.activeTeamId === teamId) {
      this.session.activeTeamId = this.session.activeTeamIds[0] || null;
    }
    if (this.session.buzzerLockedByTeamId === teamId) {
      this.session.buzzerLockedByTeamId = null;
      this.session.buzzerLockEndsAt = null;
    }
    if (this.session.challenge && this.session.challenge.challengerId === teamId) {
      this.session.challenge = null;
    }
    this.onChange();
    return { ok: true, teamName };
  }

  disqualifyTeam(teamId) {
    const t = this.team(teamId);
    if (!t) return;
    if (t.status === 'disqualified') return;
    t.status = 'disqualified';
    t.disqualifiedAt = Date.now();
    t.eliminatedInRound = this.session.round || null;
    this.session.activeTeamIds = this.session.activeTeamIds.filter(id => id !== teamId);
    if (this.session.activeTeamId === teamId) {
      this.session.activeTeamId = this.session.activeTeamIds[0] || null;
    }
    if (this.session.buzzerLockedByTeamId === teamId) {
      this.session.buzzerLockedByTeamId = null;
      this.session.buzzerLockEndsAt = null;
    }
    if (this.session.challenge && this.session.challenge.challengerId === teamId) {
      this.session.challenge = null;
    }
    this.onChange();
  }

  /* Requalify a disqualified team — keeps their progress, extends their time */
  requalifyTeam(teamId) {
    const t = this.team(teamId);
    if (!t) return { ok: false, reason: 'Team not found' };

    const s = this.session;

    t.status = 'active';
    t.disqualifiedAt = null;
    t.eliminatedInRound = null;

    if (!s.activeTeamIds.includes(teamId)) s.activeTeamIds.push(teamId);

    if (s.state === 'SELECTION') {
      const existing = s.selectionAnswers[teamId];
      if (!existing) {
        this._addToSelection(teamId);
      } else {
        const now = Date.now();
        if (existing.endsAt && existing.endsAt < now) {
          existing.endsAt = now + 5 * 60 * 1000;
        } else if (existing.endsAt) {
          existing.endsAt += 2 * 60 * 1000;
        }
      }
    }

    this.onChange();
    return { ok: true, teamName: t.teamName };
  }

  sendToInstructions() {
    this.session.state = 'INSTRUCTIONS';
    this.session.instructionsEndsAt = Date.now() + CFG.INSTR_SEC * 1000;
    this.onChange();
  }
  closeInstructions() { this.session.state = 'LOBBY'; this.onChange(); }

  startSelection() {
    const s = this.session;
    const approved = this.teams.filter(t => t.status === 'approved' || t.status === 'active');
    if (approved.length < CFG.MIN_TEAMS_TO_START)
      return { ok: false, reason: 'Need at least ' + CFG.MIN_TEAMS_TO_START + ' approved teams' };

    s.round = 0;
    s.qIndex = 0;
    s.state = 'SELECTION';
    s.activeTeamIds = [];
    s.activeTeamId = null;
    s.lastReveal = null;
    s.challenge = null;
    s.buzzerLockedByTeamId = null;
    s.buzzerLockEndsAt = null;
    s.currentQuestionId = null;
    s.selectionAnswers = {};
    s.selectionOrder = {};

    approved.forEach(t => {
      t.status = 'active';
      t.points.r0 = 0;
      this._addToSelection(t.id);
    });

    this.onChange();
    return { ok: true };
  }

  qualifyFromSelection() {
    const s = this.session;

    const eligible = this.teams
      .filter(t => {
        if (t.status !== 'active') return false;
        const rec = s.selectionAnswers[t.id];
        if (!rec) return false;
        return Object.keys(rec.answers || {}).length > 0;
      })
      .slice()
      .sort((a, b) => (b.points.r0 || 0) - (a.points.r0 || 0)
                   || (a.latency || 0) - (b.latency || 0));

    const qualifiers = eligible.slice(0, CFG.SELECTION_QUALIFY);

    this.teams.forEach(t => {
      if (t.status === 'active' && !qualifiers.includes(t)) {
        t.status = 'eliminated';
        t.eliminatedInRound = 0;
      }
    });

    s.state = 'ROUND_END';
    s.round = 0;
    s.activeTeamIds = qualifiers.map(t => t.id);
    this.onChange();
    return { ok: true, qualified: qualifiers.length };
  }

  startRound(n) {
    const s = this.session;
    const active = this.teams.filter(t => s.activeTeamIds.includes(t.id));
    if (active.length < CFG.MIN_TEAMS_TO_START)
      return { ok: false, reason: 'Not enough active teams' };

    if (n === 1) {
      this.teams.forEach(t => {
        t.points = { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, total: 0 };
        t.latency = 0;
      });
    }

    s.round = n;
    s.qIndex = 0;
    s.state = 'ROUND_INTRO';
    s.lastReveal = null;
    s.challenge = null;
    s.buzzerLockedByTeamId = null;
    s.buzzerLockEndsAt = null;
    s.currentQuestionId = null;
    s.activeTeamId = n === 3 ? s.activeTeamIds[0] : null;

    s.optionShuffle = shuffledOptionsMap(this.questions, n);

    active.forEach(t => { if (t.status === 'approved') t.status = 'active'; });

    this.onChange();

    setTimeout(() => {
      if (this.session.state === 'ROUND_INTRO' && this.session.round === n) this.showQuestion();
    }, CFG.ROUND_INTRO_MS);
    return { ok: true };
  }

  showQuestion() {
    const s = this.session;
    const q = this.currentQuestion();
    if (!q) return this.endRound();

    s.state = 'QUESTION_ACTIVE';
    s.currentQuestionId = q.id;
    s.questionStartedAt = Date.now();
    s.questionEndsAt = q.timeLimitSec ? Date.now() + q.timeLimitSec * 1000 : null;
    s.revealEndsAt = null;
    s.lastReveal = null;
    s.challenge = null;
    s.buzzerLockedByTeamId = null;
    s.buzzerLockEndsAt = null;
    this.onChange();
  }

  nextQuestion() {
    const s = this.session;

    if (s.round === 0) {
      const qs = this.roundQuestions(0);
      if (s.qIndex + 1 >= qs.length) return this.qualifyFromSelection();
      s.qIndex += 1;
      s.currentQuestionId = qs[s.qIndex].id;
      s.questionStartedAt = Date.now();
      this.onChange();
      return;
    }

    const qs = this.roundQuestions(s.round);
    if (s.qIndex + 1 >= qs.length) return this.endRound();
    s.qIndex += 1;

    if (s.round === 3 && s.activeTeamIds.length) {
      const idx = s.activeTeamIds.indexOf(s.activeTeamId);
      s.activeTeamId = s.activeTeamIds[(idx + 1) % s.activeTeamIds.length];
    }
    this.showQuestion();
  }

  finishQuestion() {
    const s = this.session;
    if (s.round === 1) this.evalR1();
    else if (s.round === 2) this.evalR2();
    else if (s.round === 4) this.evalR4();
    s.state = 'QUESTION_REVEAL';
    s.revealEndsAt = null;
    s.buzzerLockedByTeamId = null;
    s.buzzerLockEndsAt = null;
    s.challenge = null;
    this.onChange();
  }

  endRound() {
    const s = this.session;
    s.state = 'ROUND_END';
    if (s.round >= 1 && s.round <= 4) {
      const cut = CFG.ROUND_CUTS[s.round] || 0;
      const lb = this.leaderboard();
      if (cut > 0 && lb.length > cut) {
        const eliminated = lb.slice(lb.length - cut);
        const survivors = lb.slice(0, lb.length - cut);
        eliminated.forEach(t => { t.status = 'eliminated'; t.eliminatedInRound = s.round; });
        s.activeTeamIds = survivors.map(t => t.id);
      }
    } else if (s.round === 5) {
      const lb = this.leaderboard();
      lb.forEach((t, i) => { t.status = 'winner'; t.finalRank = i + 1; });
      s.state = 'FINISHED';
    }
    this.onChange();
  }

  endSession() {
    const lb = this.leaderboard(this.teams.filter(t => t.status !== 'registered').map(t => t.id));
    lb.forEach((t, i) => { t.status = 'winner'; t.finalRank = i + 1; });
    this.session.state = 'FINISHED';
    this.onChange();
  }

  resetSession() {
    this.session = this.blankSession();
    this.answers = [];
    this.teams.forEach(t => {
      t.points = { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, total: 0 };
      t.latency = 0;
      t.eliminatedInRound = null;
      t.finalRank = null;
      if (t.status !== 'registered') t.status = 'approved';
    });
    this.onChange();
  }

  clearAll() {
    this.session = this.blankSession();
    this.teams = [];
    this.answers = [];
    this.onChange();
  }

  evalR1() {
    const q = this.currentQuestion();
    const answers = this.answers.filter(a => a.questionId === q.id);
    const scored = answers
      .map(a => ({ a, delta: Math.abs(Number(a.rawAnswer) - Number(q.correctAnswer)) }))
      .filter(x => isFinite(x.delta))
      .sort((x, y) => x.delta - y.delta);
    scored.forEach((x, i) => {
      x.a.guessDelta = x.delta;
      x.a.isCorrect = x.delta === 0;
      const idx = Math.min(i, CFG.R1_SCALE.length - 1);
      x.a.pointsAwarded = CFG.R1_SCALE[idx];
      this.addPoints(x.a.teamId, 1, x.a.pointsAwarded);
    });
    this.session.lastReveal = {
      questionId: q.id, correctAnswer: q.correctAnswer, unit: q.unit,
      results: scored.map(x => ({ teamId: x.a.teamId, delta: x.delta, points: x.a.pointsAwarded })),
      note: 'CLOSEST GUESS'
    };
  }

  evalR2() {
    const q = this.currentQuestion();
    const answers = this.answers.filter(a => a.questionId === q.id);
    const correct = answers.filter(a => a.rawAnswer === q.correctAnswer)
      .sort((a, b) => a.receivedAt - b.receivedAt);
    correct.forEach((a, i) => {
      a.isCorrect = true;
      const idx = Math.min(i, CFG.R2_SCALE.length - 1);
      a.pointsAwarded = CFG.R2_SCALE[idx];
      this.addPoints(a.teamId, 2, a.pointsAwarded);
    });
    this.session.lastReveal = {
      questionId: q.id, correctAnswer: q.correctAnswer,
      results: correct.map((a, i) => ({ teamId: a.teamId, rank: i + 1, latencyMs: a.latencyMs, points: a.pointsAwarded })),
      note: 'FASTEST FINGER'
    };
  }

  evalR3Single(rec, q) {
    const ok = rec.rawAnswer === q.correctAnswer;
    rec.isCorrect = ok;
    if (rec.wasChallenge) {
      rec.pointsAwarded = ok ? CFG.R3_STEAL : CFG.R3_FAIL;
      this.addPoints(rec.teamId, 3, rec.pointsAwarded);
      this.session.lastReveal = {
        questionId: q.id, correctAnswer: q.correctAnswer,
        results: [{ teamId: rec.teamId, correct: ok, points: rec.pointsAwarded, challenge: true }],
        note: ok ? 'CHALLENGE STOLEN!' : 'CHALLENGE FAILED'
      };
    } else {
      rec.pointsAwarded = ok ? CFG.R3_CORRECT : 0;
      this.addPoints(rec.teamId, 3, rec.pointsAwarded);
      this.session.lastReveal = {
        questionId: q.id, correctAnswer: q.correctAnswer,
        results: [{ teamId: rec.teamId, correct: ok, points: rec.pointsAwarded }],
        note: ok ? 'CORRECT' : 'WRONG'
      };
    }
    this.finishQuestion();
  }

  evalR4() {
    const q = this.currentQuestion();
    const answers = this.answers.filter(a => a.questionId === q.id);
    answers.forEach(a => {
      const ok = a.rawAnswer === q.correctAnswer;
      a.isCorrect = ok;
      a.pointsAwarded = ok ? CFG.R4_CORRECT : CFG.R4_WRONG;
      this.addPoints(a.teamId, 4, a.pointsAwarded);
    });
    this.session.lastReveal = {
      questionId: q.id, correctAnswer: q.correctAnswer,
      results: answers.map(a => ({ teamId: a.teamId, correct: a.isCorrect, points: a.pointsAwarded })),
      note: 'RAPID FIRE'
    };
  }

  evalR5Single(rec, q) {
    const ok = rec.rawAnswer === q.correctAnswer;
    rec.isCorrect = ok;
    rec.pointsAwarded = ok ? CFG.R5_CORRECT : CFG.R5_WRONG;
    this.addPoints(rec.teamId, 5, rec.pointsAwarded);
    this.session.lastReveal = {
      questionId: q.id, correctAnswer: q.correctAnswer,
      results: [{ teamId: rec.teamId, correct: ok, points: rec.pointsAwarded, buzzer: true }],
      note: ok ? 'BUZZER CORRECT!' : 'BUZZER WRONG'
    };
    this.finishQuestion();
  }

  addQuestion(o) {
    const rq = this.roundQuestions(o.roundNumber);
    const order = rq.length ? Math.max(...rq.map(q => q.order)) + 1 : 1;
    const q = {
      id: uuid(), roundNumber: o.roundNumber, order,
      type: o.type, text: o.text,
      options: o.type === 'mcq' ? o.options : undefined,
      correctAnswer: o.type === 'saq' ? normalizeAnswer(o.correctAnswer) : o.correctAnswer,
      unit: o.unit || '',
      points: o.points || 10, timeLimitSec: o.timeLimitSec || 30,
      isActive: true, editedAt: null
    };
    this.questions.push(q);
    this.onChange();
    return q;
  }
  editQuestion(id, patch) {
    const q = this.questions.find(x => x.id === id);
    if (!q) return;
    if (q.type === 'saq' && patch.correctAnswer != null) {
      patch.correctAnswer = normalizeAnswer(patch.correctAnswer);
    }
    Object.assign(q, patch, { editedAt: Date.now() });
    this.onChange();
  }
  deleteQuestion(id) {
    const idx = this.questions.findIndex(q => q.id === id);
    if (idx === -1) return;
    const r = this.questions[idx].roundNumber;
    this.questions.splice(idx, 1);
    this.roundQuestions(r).forEach((q, i) => { q.order = i + 1; });
    this.onChange();
  }
  moveQuestion(id, direction) {
    const q = this.questions.find(x => x.id === id);
    if (!q) return;
    const rq = this.roundQuestions(q.roundNumber);
    const idx = rq.findIndex(x => x.id === id);
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= rq.length) return;
    const tmp = rq[idx].order;
    rq[idx].order = rq[swap].order;
    rq[swap].order = tmp;
    this.onChange();
  }

  tick() {
    const s = this.session;
    const n = Date.now();

    if (s.state === 'SELECTION') {
      return false;
    }

    if (s.state === 'QUESTION_ACTIVE') {
      const q = this.currentQuestion();
      if (!q) return false;

      if (s.round === 5 && s.buzzerLockedByTeamId && s.buzzerLockEndsAt && n >= s.buzzerLockEndsAt) {
        const lockedId = s.buzzerLockedByTeamId;
        this.addPoints(lockedId, 5, CFG.R5_WRONG);
        s.lastReveal = {
          questionId: q.id, correctAnswer: q.correctAnswer,
          results: [{ teamId: lockedId, correct: false, points: CFG.R5_WRONG, timeout: true }],
          note: 'BUZZER TIMEOUT'
        };
        this.finishQuestion();
        return true;
      }
      if (s.round === 3 && s.challenge && n >= s.challenge.endsAt) {
        const cid = s.challenge.challengerId;
        this.addPoints(cid, 3, CFG.R3_FAIL);
        s.lastReveal = {
          questionId: q.id, correctAnswer: q.correctAnswer,
          results: [{ teamId: cid, correct: false, points: CFG.R3_FAIL, challenge: true, timeout: true }],
          note: 'CHALLENGE TIMEOUT'
        };
        this.finishQuestion();
        return true;
      }
      if (s.questionEndsAt && n >= s.questionEndsAt) {
        this.finishQuestion();
        return true;
      }
    } else if (s.state === 'INSTRUCTIONS') {
      if (s.instructionsEndsAt && n >= s.instructionsEndsAt) {
        s.state = 'LOBBY';
        return true;
      }
    }
    return false;
  }
}

/* ============================================================
   SANITIZE
   ============================================================ */
function applyOptionShuffle(q, shuffleEntry) {
  if (!shuffleEntry || !q.options) return q;
  const copy = { ...q };
  copy.options = shuffleEntry.order.map(oldIdx => q.options[oldIdx]);
  copy.correctAnswer = shuffleEntry.correctAnswer;
  return copy;
}

function sanitizeForTeam(game, teamId) {
  const s = game.session;
  const out = JSON.parse(JSON.stringify({
    session: s, questions: game.questions,
    teams: game.teams, answers: game.answers
  }));

  if (out.session.state === 'QUESTION_ACTIVE' && out.session.round !== 0) {
    const cq = out.session.currentQuestionId;
    out.questions = out.questions.map(q => {
      if (q.id === cq) {
        const copy = { ...q };
        delete copy.correctAnswer;
        return copy;
      }
      return q;
    });
  }

  out.questions = out.questions.map(q => applyOptionShuffle(q, s.optionShuffle[q.id]));

  if (s.state === 'SELECTION' && teamId) {
    const myOrder = s.selectionOrder[teamId] || [];
    const selQs = out.questions.filter(q => q.roundNumber === 0);
    const myQs = myOrder.map(id => selQs.find(q => q.id === id)).filter(Boolean);
    const others = out.questions.filter(q => q.roundNumber !== 0);
    out.questions = [...myQs, ...others];
  }

  return out;
}

function sanitizeForProjector(game) {
  const s = game.session;
  const out = JSON.parse(JSON.stringify({
    session: s, questions: game.questions,
    teams: game.teams, answers: game.answers
  }));

  if (out.session.state === 'SELECTION') {
    out.questions = out.questions.filter(q => q.roundNumber !== 0);
    delete out.session.selectionAnswers;
    delete out.session.selectionOrder;
  }
  if (out.session.state === 'QUESTION_ACTIVE' && out.session.round !== 0) {
    const cq = out.session.currentQuestionId;
    out.questions = out.questions.map(q => {
      if (q.id === cq) {
        const copy = { ...q };
        delete copy.correctAnswer;
        return copy;
      }
      return q;
    });
  }
  return out;
}

function snapshotAdmin(game) {
  return {
    session: game.session, questions: game.questions,
    teams: game.teams, answers: game.answers
  };
}

/* ============================================================
   SOCKET
   ============================================================ */
function setupSocket(io) {
  const game = new Game(() => broadcast());
  io.game = game;
  const socketTeam = new Map();
  const pendingDisq = new Map();
  const disqualifiedTeams = new Set();

  function broadcast() {
    io.to('admin').emit('state', snapshotAdmin(game));
    io.to('projector').emit('state', sanitizeForProjector(game));
    for (const [socketId, tid] of socketTeam.entries()) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) sock.emit('state', sanitizeForTeam(game, tid));
    }
  }
  function broadcastSlots() {
    io.emit('admin:slots', {
      total: MAX_ADMIN_SLOTS,
      active: activeAdminCount(),
      available: adminSlotsAvailable()
    });
  }
  function cancelPendingDisq(tid) {
    if (tid && pendingDisq.has(tid)) {
      clearTimeout(pendingDisq.get(tid));
      pendingDisq.delete(tid);
    }
  }

  setInterval(() => { if (game.tick()) broadcast(); }, CFG.TICK_MS);

  io.on('connection', (socket) => {
    socket.emit('admin:slots', {
      total: MAX_ADMIN_SLOTS,
      active: activeAdminCount(),
      available: adminSlotsAvailable()
    });

    socket.on('admin:slots:get', () => {
      socket.emit('admin:slots', {
        total: MAX_ADMIN_SLOTS,
        active: activeAdminCount(),
        available: adminSlotsAvailable()
      });
    });

    socket.on('admin:requestOtp', ({ mobile }, ack) => {
      const admin = findAdminByMobile(String(mobile || '').trim());
      if (!admin) return ack && ack({ ok: false, reason: 'Mobile number not registered as admin' });
      const existingToken = adminByMobile.get(admin.mobile);
      if (existingToken && adminSessions.has(existingToken))
        return ack && ack({ ok: false, reason: 'This admin is already logged in' });
      if (adminSlotsAvailable() <= 0)
        return ack && ack({ ok: false, reason: 'All admin slots are in use.' });

      const otp = generateOtp();
      otpStore.set(admin.mobile, { otp, expiresAt: Date.now() + OTP_TTL_MS });
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  🔐 BRAINRUSH ADMIN OTP              ║');
      console.log('╠══════════════════════════════════════╣');
      console.log('║  ' + admin.name.padEnd(34) + '║');
      console.log('║  ' + admin.mobile.padEnd(34) + '║');
      console.log('║  OTP: ' + otp.padEnd(29) + '║');
      console.log('╚══════════════════════════════════════╝\n');
      ack && ack({ ok: true, message: 'OTP sent', devOtp: otp });
    });

    socket.on('admin:verifyOtp', ({ mobile, otp }, ack) => {
      const admin = findAdminByMobile(String(mobile || '').trim());
      if (!admin) return ack && ack({ ok: false, reason: 'Invalid mobile' });
      const entry = otpStore.get(admin.mobile);
      if (!entry) return ack && ack({ ok: false, reason: 'No OTP requested' });
      if (Date.now() > entry.expiresAt) {
        otpStore.delete(admin.mobile);
        return ack && ack({ ok: false, reason: 'OTP expired' });
      }
      if (entry.otp !== String(otp || '').trim())
        return ack && ack({ ok: false, reason: 'Wrong OTP' });
      if (adminSlotsAvailable() <= 0) {
        otpStore.delete(admin.mobile);
        return ack && ack({ ok: false, reason: 'All admin slots are now in use' });
      }
      otpStore.delete(admin.mobile);
      const token = uuid();
      adminSessions.set(token, { adminId: admin.id, socketId: socket.id, lastSeen: Date.now() });
      adminByMobile.set(admin.mobile, token);
      socket.join('admin');
      socket.data.role = 'admin';
      socket.data.adminId = admin.id;
      socket.data.adminToken = token;
      broadcastSlots();
      socket.emit('state', snapshotAdmin(game));
      ack && ack({ ok: true, token, adminId: admin.id, name: admin.name });
    });

    socket.on('role:admin', ({ token } = {}) => {
      const sess = token ? adminSessions.get(token) : null;
      if (sess) {
        sess.socketId = socket.id;
        sess.lastSeen = Date.now();
        socket.join('admin');
        socket.data.role = 'admin';
        socket.data.adminId = sess.adminId;
        socket.data.adminToken = token;
        socket.emit('state', snapshotAdmin(game));
        broadcastSlots();
        return;
      }
      socket.emit('state', sanitizeForTeam(game, null));
    });

    socket.on('role:projector', ({ token } = {}) => {
      const sess = token ? adminSessions.get(token) : null;
      if (!sess) {
        socket.emit('projector:denied');
        return;
      }
      socket.data.role = 'projector';
      socket.data.adminToken = token;
      socket.join('projector');
      socket.emit('state', sanitizeForProjector(game));
    });

    socket.on('role:team', ({ teamId } = {}) => {
      socket.data.role = 'team';
      if (teamId && game.team(teamId)) {
        const t = game.team(teamId);
        cancelPendingDisq(teamId);

        const s = game.session;
        if (s.state === 'SELECTION' && !s.selectionAnswers[teamId] &&
            (t.status === 'active' || t.status === 'approved')) {
          game._addToSelection(teamId);
        }

        t.connected = true;
        socketTeam.set(socket.id, teamId);
        socket.data.teamId = teamId;
        socket.emit('state', sanitizeForTeam(game, teamId));
        broadcast();
        return;
      }
      socket.emit('state', sanitizeForTeam(game, null));
    });

    socket.on('team:register', ({ teamName, students }, ack) => {
      const banned = game.teams.some(t =>
        t.teamName.toLowerCase() === String(teamName || '').toLowerCase() &&
        t.status === 'disqualified'
      );
      if (banned) return ack && ack({ ok: false, reason: 'This team was disqualified' });
      const result = game.registerTeam({ teamName, students });
      if (!result.ok) return ack && ack(result);
      socketTeam.set(socket.id, result.teamId);
      socket.data.teamId = result.teamId;
      socket.data.role = 'team';
      broadcast();
      ack && ack({ ok: true, teamId: result.teamId });
    });

    socket.on('team:ackInstructions', () => {
      const tid = socket.data.teamId;
      if (tid) { cancelPendingDisq(tid); game.ackInstructions(tid); }
    });

    socket.on('team:answer', ({ questionId, answer }, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      const result = game.submitAnswer({ teamId: tid, questionId, answer });
      if (result && result.privateUpdate) {
        socket.emit('state', sanitizeForTeam(game, tid));
      } else {
        broadcast();
      }
      ack && ack(result);
    });

    socket.on('team:skipSelection', (_, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      const r = game.skipSelectionQuestion({ teamId: tid });
      socket.emit('state', sanitizeForTeam(game, tid));
      ack && ack(r);
    });

    socket.on('team:selectionBack', (_, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      const r = game.selectionGoBack({ teamId: tid });
      socket.emit('state', sanitizeForTeam(game, tid));
      ack && ack(r);
    });

    socket.on('team:selectionForward', (_, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      const r = game.selectionForward({ teamId: tid });
      socket.emit('state', sanitizeForTeam(game, tid));
      ack && ack(r);
    });

    socket.on('team:buzz', ({ questionId }, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      ack && ack(game.buzz({ teamId: tid, questionId }));
    });
    socket.on('team:challenge', ({ questionId }, ack) => {
      const tid = socket.data.teamId;
      if (!tid) return ack && ack({ ok: false });
      cancelPendingDisq(tid);
      ack && ack(game.challenge({ teamId: tid, questionId }));
    });

    socket.on('team:visibilityLost', () => {
      const tid = socket.data.teamId;
      if (!tid) return;
      const t = game.team(tid);
      if (!t || t.status !== 'active') return;
      if (pendingDisq.has(tid)) return;

      const handle = setTimeout(() => {
        pendingDisq.delete(tid);
        const stillThere = [...socketTeam.values()].includes(tid);
        if (stillThere) return;
        disqualifiedTeams.add(tid);
        game.disqualifyTeam(tid);
        broadcast();
      }, CFG.DISQUALIFY_GRACE_MS);

      pendingDisq.set(tid, handle);
    });

    const adminGuard = (fn) => (...args) => {
      if (socket.data.role !== 'admin') return;
      fn(...args);
    };
    socket.on('admin:approveTeam',        adminGuard(({ teamId, yes }) => game.approveTeam(teamId, yes)));
    socket.on('admin:approveAll',         adminGuard(() => game.approveAll()));
    socket.on('admin:deleteTeam',         adminGuard(({ teamId }, ack) => {
      const r = game.deleteTeam(teamId);
      ack && ack(r);
    }));
    socket.on('admin:requalifyTeam',      adminGuard(({ teamId }, ack) => {
      const r = game.requalifyTeam(teamId);
      ack && ack(r);
    }));
    socket.on('admin:sendToInstructions', adminGuard(() => game.sendToInstructions()));
    socket.on('admin:closeInstructions',  adminGuard(() => game.closeInstructions()));
    socket.on('admin:startSelection',     adminGuard((_, ack) => {
      const r = game.startSelection();
      ack && ack(r);
    }));
    socket.on('admin:qualifySelection',   adminGuard((_, ack) => {
      const r = game.qualifyFromSelection();
      ack && ack(r);
    }));
    socket.on('admin:startRound',         adminGuard(({ round }, ack) => {
      const r = game.startRound(round);
      ack && ack(r);
    }));
    socket.on('admin:nextQuestion', adminGuard(() => game.nextQuestion()));
    socket.on('admin:forceReveal',  adminGuard(() => game.finishQuestion()));
    socket.on('admin:endSession',   adminGuard(() => game.endSession()));
    socket.on('admin:resetSession', adminGuard(() => game.resetSession()));
    socket.on('admin:clearAll',     adminGuard(() => game.clearAll()));
    socket.on('admin:question:add',    adminGuard((p) => game.addQuestion(p)));
    socket.on('admin:question:edit',   adminGuard(({ id, patch }) => game.editQuestion(id, patch)));
    socket.on('admin:question:delete', adminGuard(({ id }) => game.deleteQuestion(id)));
    socket.on('admin:question:move',   adminGuard(({ id, direction }) => game.moveQuestion(id, direction)));

    socket.on('disconnect', () => {
      const tid = socketTeam.get(socket.id);
      if (tid) {
        socketTeam.delete(socket.id);
        const t = game.team(tid);
        if (t) {
          t.connected = false;
          if (t.status === 'active' && !disqualifiedTeams.has(tid) && !pendingDisq.has(tid)) {
            const handle = setTimeout(() => {
              pendingDisq.delete(tid);
              const stillThere = [...socketTeam.values()].includes(tid);
              if (stillThere) return;
              disqualifiedTeams.add(tid);
              game.disqualifyTeam(tid);
            }, CFG.DISQUALIFY_GRACE_MS);
            pendingDisq.set(tid, handle);
          }
        }
        broadcast();
      }
      const adminToken = socket.data.adminToken;
      if (adminToken && adminSessions.has(adminToken)) {
        const sess = adminSessions.get(adminToken);
        sess.socketId = null;
        sess.lastSeen = Date.now();
        broadcastSlots();
      }
    });
  });

  return game;
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
const app = express();
app.use(cors());
const clientDir = path.join(__dirname, 'client');
app.use(express.static(clientDir));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get('/projector', (req, res) => {
  res.sendFile(path.join(clientDir, 'projector.html'));
});
app.get('*', (req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

setupSocket(io);
server.listen(CFG.PORT, () => {
  console.log('BRAINRUSH server listening on http://localhost:' + CFG.PORT);
  console.log('Admins: ' + ADMINS.map(a => a.name + ' (' + a.mobile + ')').join(', '));
});