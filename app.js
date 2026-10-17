'use strict';
/* FirstChalk — 선생님을 향한 첫걸음, 공부 기록장
   외부 라이브러리 없이 동작합니다. 모든 데이터는 이 기기의 IndexedDB에 저장돼요. */

// ───────────────────────── 유틸 ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dateLabel = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const fmtMin = (ms) => {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`) : `${m}분`;
};
const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? `${pad(h)}:` : '') + `${pad(m)}:${pad(s % 60)}`;
};
const COLORS = ['#8B5E3C', '#6B7F4E', '#B5694A', '#5F7480', '#A8843F', '#7A5C6B', '#4F6F62', '#9A6B52'];

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  rec: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 8h6M9 12h6"/>',
  stat: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ───────────────────────── 저장소 (IndexedDB) ─────────────────────────
const STORES = ['subjects', 'sessions', 'todos', 'interviews', 'notes'];
let _db;
function openDB() {
  if (!_db) {
    _db = new Promise((res, rej) => {
      const r = indexedDB.open('firstchalk', 1);
      r.onupgradeneeded = () => {
        STORES.forEach((n) => r.result.createObjectStore(n, { keyPath: 'id', autoIncrement: true }));
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return _db;
}
async function dbAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbPut(store, obj) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const r = t.objectStore(store).put(obj);
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
  });
}
async function dbDel(store, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function dbClear(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

const S = { subjects: [], sessions: [], todos: [], interviews: [], notes: [] };
const refresh = async (store) => { S[store] = await dbAll(store); };
const subj = (id) => S.subjects.find((s) => s.id === id);
const subjChip = (id) => {
  const s = subj(id);
  return s ? `<span class="chip" style="--c:${s.color}">${esc(s.name)}</span>` : '';
};
const subjOptions = (sel) =>
  S.subjects.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

// 캘린더 칸에 들어갈 짧은 시간 표기 (45분, 1h20, 3h)
const shortTime = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
};
// 공부 시간에 따른 색 단계: 0 없음, 1 1시간 미만, 2 1~3시간, 3 3시간 이상
const levelOf = (ms) => (!ms ? 0 : ms < 3600000 ? 1 : ms < 3 * 3600000 ? 2 : 3);

// 과목 선택 + 그 자리에서 새 과목 추가
function subjPicker(key, sel, { optional = true, disabled = false } = {}) {
  const attr = key === 'timer' ? 'data-change="tsubj"' : 'name="subjectId"';
  return `<div class="row"><select class="grow" ${attr} ${disabled ? 'disabled' : ''}>${optional ? '<option value="">선택 안 함</option>' : ''}${subjOptions(sel)}</select>
    <button type="button" class="btn ghost sm nowrap" data-a="subjadd" data-k="${key}" ${disabled ? 'disabled' : ''}>+ 과목</button></div>
    ${ui.subjAdd === key ? `<div class="row" style="margin-top:8px"><input type="text" id="subj-new" maxlength="20" placeholder="새 과목 이름 (예: 교육학)" class="grow" enterkeyhint="done">
    <button type="button" class="btn sm" data-a="subjsave" data-k="${key}">추가</button></div>` : ''}`;
}

// 다시 그릴 때 입력 중이던 폼 내용이 날아가지 않게 보존
async function keepDraft(el, fn) {
  const host = el.closest('form[data-form]');
  const kind = host?.dataset.form;
  const saved = host ? [...host.elements].filter((e) => e.name && e.name !== 'subjectId').map((e) => [e.name, e.value]) : [];
  await fn();
  const f = kind && $(`form[data-form="${kind}"]`);
  if (f) saved.forEach(([n, v]) => { if (f.elements[n]) f.elements[n].value = v; });
}

function subjRows(bySubj) {
  return Object.entries(bySubj).sort((a, b) => b[1] - a[1]).map(([id, ms]) => `
    <div class="subj-row"><span class="swatch" style="--c:${subj(+id)?.color || '#B8A58F'}"></span>
    <span class="grow">${esc(subj(+id)?.name || '삭제된 과목')}</span><span class="muted">${fmtMin(ms)}</span></div>`).join('');
}

// ───────────────────────── 타이머 상태 ─────────────────────────
const POMO_MS = 25 * 60 * 1000;
const blankTimer = (mode = 'free', subjectId = null) => ({ subjectId, mode, startedAt: null, acc: 0, runStart: null, notified: false });
let T;
try { T = JSON.parse(localStorage.getItem('fc_timer')) || blankTimer(); } catch { T = blankTimer(); }
const saveT = () => { try { localStorage.setItem('fc_timer', JSON.stringify(T)); } catch { /* 저장소 사용 불가 */ } };
const elapsed = () => T.acc + (T.runStart ? Date.now() - T.runStart : 0);
const timerActive = () => T.startedAt != null;

let wakeLock = null;
async function setWake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* 지원 안 함 */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.keepAwake && T.runStart) setWake(true);
});

// ───────────────────────── UI 상태 ─────────────────────────
const ui = {
  tab: 'home',
  calMonth: today().slice(0, 7),
  selDate: today(),
  rseg: 'interview',
  showIForm: false,
  editI: null,
  openI: null,
  iq: '',
  itopic: '',
  istar: false,
  range: 'week',
  statMonth: today().slice(0, 7),
  timerSubject: null,
  subjAdd: null,
  pick: { note: null, todo: null },
  keepAwake: false
};

const TABS = [
  ['home', '홈', 'home'],
  ['cal', '캘린더', 'cal'],
  ['timer', '타이머', 'timer'],
  ['rec', '기록', 'rec'],
  ['stat', '통계', 'stat']
];

// ───────────────────────── 계산 도우미 ─────────────────────────
const minutesByDate = () => {
  const m = {};
  S.sessions.forEach((s) => { m[s.date] = (m[s.date] || 0) + s.duration; });
  return m;
};
const streak = () => {
  const m = minutesByDate();
  let d = today();
  if (!m[d]) d = addDays(d, -1);
  let n = 0;
  while (m[d]) { n++; d = addDays(d, -1); }
  return n;
};
const todosOn = (date) => S.todos.filter((t) => t.date === date).sort((a, b) => a.done - b.done || a.id - b.id);

function tomorrowBanner() {
  const list = S.todos.filter((t) => t.date === addDays(today(), 1) && !t.done);
  if (!list.length) return '<div class="tomorrow empty">내일은 예정된 일이 없어요.</div>';
  return `<div class="tomorrow">내일 할 일은 ${list.map((t) => `<b>${esc(t.title)}</b>`).join(', ')} 입니다.</div>`;
}

function todoItem(t) {
  return `<li class="todo ${t.done ? 'done' : ''}">
    <button class="chk" data-a="todotoggle" data-id="${t.id}" aria-label="${t.done ? '완료 취소' : '완료 체크'}">${t.done ? '✓' : ''}</button>
    <div class="todo-body" data-a="todotoggle" data-id="${t.id}">
      <div class="todo-title">${esc(t.title)}</div>
      ${t.memo ? `<div class="muted small">${esc(t.memo)}</div>` : ''}
      ${t.subjectId ? subjChip(t.subjectId) : ''}
    </div>
    <button class="icon-btn" data-a="tododel" data-id="${t.id}" aria-label="삭제">×</button>
  </li>`;
}

// ───────────────────────── 화면: 홈 ─────────────────────────
function viewHome() {
  const td = today();
  const sess = S.sessions.filter((s) => s.date === td);
  const total = sess.reduce((a, s) => a + s.duration, 0);
  const bySubj = {};
  sess.forEach((s) => { bySubj[s.subjectId] = (bySubj[s.subjectId] || 0) + s.duration; });
  const todays = todosOn(td);
  const doneN = todays.filter((t) => t.done).length;
  return `
    <h2>오늘 · ${dateLabel(td)}</h2>
    <div class="stats">
      <div class="stat"><b>${total ? fmtMin(total) : '0분'}</b><span>오늘 공부 시간</span></div>
      <div class="stat"><b>${streak()}일</b><span>연속 공부</span></div>
    </div>
    ${Object.keys(bySubj).length ? `<div class="card" style="margin-top:10px">${Object.entries(bySubj).map(([id, ms]) => `
      <div class="subj-row"><span class="swatch" style="--c:${subj(+id)?.color || '#B8A58F'}"></span>
      <span class="grow">${esc(subj(+id)?.name || '삭제된 과목')}</span><span class="muted">${fmtMin(ms)}</span></div>`).join('')}</div>` : ''}
    <h2>오늘 할 일${todays.length ? ` · ${doneN}/${todays.length} 완료` : ''}</h2>
    <div class="card">${todays.length ? `${doneN === todays.length ? '<div class="alldone-msg">오늘 할 일을 모두 해냈어요 👏</div>' : ''}<ul class="todos">${todays.map(todoItem).join('')}</ul>` : '<div class="empty">오늘 등록된 할 일이 없어요.</div>'}</div>
    <form class="row" data-form="todo-today" style="margin-top:8px" autocomplete="off">
      <input type="text" name="title" required maxlength="120" placeholder="오늘 할 일 바로 추가" class="grow">
      <button class="btn" type="submit">추가</button>
    </form>
    ${tomorrowBanner()}
    ${timerActive() ? `<div class="card" style="margin-top:10px"><div class="row"><div class="grow">진행 중인 타이머 · ${esc(subj(T.subjectId)?.name || '')}</div><button class="btn sm" data-a="tab" data-t="timer">보기</button></div></div>` : ''}
  `;
}

// ───────────────────────── 화면: 캘린더 ─────────────────────────
function viewCal() {
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const td = today();
  const mins = minutesByDate();
  const byDate = {};
  S.todos.forEach((t) => { (byDate[t.date] ||= []).push(t); });
  let cells = '';
  let monthSum = 0;
  for (let i = 0; i < first; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const list = byDate[ds];
    const ms = mins[ds] || 0;
    monthSum += ms;
    const dow = (first + d - 1) % 7;
    const cls = ['cell', `lv${levelOf(ms)}`, dow === 0 ? 'sun' : '', ds === td ? 'today' : '', ds === ui.selDate ? 'sel' : ''].join(' ');
    const dot = list ? `<span class="dot ${list.every((t) => t.done) ? 'alldone' : ''}"></span>` : '';
    cells += `<button class="${cls}" data-a="pick" data-d="${ds}"><span class="num">${d}</span>${ms ? `<span class="ct">${shortTime(ms)}</span>` : ''}${dot}</button>`;
  }
  const sel = todosOn(ui.selDate);
  const selSess = S.sessions.filter((s) => s.date === ui.selDate);
  const selTotal = selSess.reduce((a, s) => a + s.duration, 0);
  const selBy = {};
  selSess.forEach((s) => { selBy[s.subjectId] = (selBy[s.subjectId] || 0) + s.duration; });
  return `
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-a="calprev" aria-label="이전 달">‹</button>
        <div class="center"><div class="cal-title">${y}년 ${m}월</div>
          <div class="muted small">${monthSum ? `이번 달 공부 ${fmtMin(monthSum)}` : '공부 기록 없음'}</div></div>
        <div class="row" style="gap:2px">
          <button class="btn ghost sm" data-a="caltoday">오늘</button>
          <button class="icon-btn" data-a="calnext" aria-label="다음 달">›</button>
        </div>
      </div>
      <div class="cal-grid">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div>
      <div class="legend"><i class="lv1"></i>1시간 미만<i class="lv2"></i>1~3시간<i class="lv3"></i>3시간 이상</div>
    </div>
    ${tomorrowBanner()}
    <h2>${dateLabel(ui.selDate)} 공부</h2>
    <div class="card">${selTotal ? `<div class="row"><b class="grow">총 ${fmtMin(selTotal)}</b></div>${subjRows(selBy)}` : '<div class="muted small">이 날의 공부 기록이 없어요.</div>'}</div>
    <h2>${dateLabel(ui.selDate)} 할 일</h2>
    <div class="card">${sel.length ? `<ul class="todos">${sel.map(todoItem).join('')}</ul>` : '<div class="empty">이 날의 할 일이 없어요.</div>'}</div>
    <form class="card stack" data-form="todo" style="margin-top:10px" autocomplete="off">
      <div><label class="f">할 일</label><input type="text" name="title" required maxlength="120" placeholder="예: 교육학 2단원 정리"></div>
      <div><label class="f">메모 (선택)</label><input type="text" name="memo" maxlength="200"></div>
      <div><label class="f">과목 (선택)</label>${subjPicker('todo', ui.pick.todo)}</div>
      <button class="btn block" type="submit">${dateLabel(ui.selDate)}에 추가</button>
    </form>`;
}

// ───────────────────────── 화면: 타이머 ─────────────────────────
function clockText() {
  const el = elapsed();
  if (T.mode === 'pomo') return el < POMO_MS ? fmtClock(POMO_MS - el) : `+${fmtClock(el - POMO_MS)}`;
  return fmtClock(el);
}
function viewTimer() {
  const active = timerActive();
  const running = !!T.runStart;
  if (!S.subjects.length) {
    return `<div class="card stack">
      <div class="center"><b>먼저 과목을 추가해 주세요</b><div class="muted small">타이머 기록이 과목별로 쌓여요.</div></div>
      <form class="stack" data-form="subject" autocomplete="off">
        <input type="text" name="name" required maxlength="20" placeholder="예: 교육학, 전공, 면접 준비">
        <button class="btn block" type="submit">과목 추가</button>
      </form></div>`;
  }
  const sid = active ? T.subjectId : (ui.timerSubject ?? T.subjectId ?? S.subjects[0].id);
  const td = today();
  const sess = S.sessions.filter((s) => s.date === td).sort((a, b) => b.start - a.start);
  return `
    <div class="card stack">
      <div class="seg">
        <button data-a="mode" data-m="free" class="${T.mode === 'free' ? 'on' : ''}" ${active ? 'disabled' : ''}>일반</button>
        <button data-a="mode" data-m="pomo" class="${T.mode === 'pomo' ? 'on' : ''}" ${active ? 'disabled' : ''}>뽀모도로 25분</button>
      </div>
      <div><label class="f">과목</label>${subjPicker('timer', sid, { optional: false, disabled: active })}</div>
      <div class="clock" id="clock">${clockText()}</div>
      <div class="clock-sub" id="clock-sub">${subClockText()}</div>
      <div class="row">
        ${!active ? '<button class="btn grow" data-a="tstart">시작</button>' : `
          <button class="btn ghost grow" data-a="${running ? 'tpause' : 'tresume'}">${running ? '일시정지' : '다시 시작'}</button>
          <button class="btn grow" data-a="tstop">종료하고 기록</button>`}
      </div>
      <label class="row small muted" style="gap:8px"><input type="checkbox" data-change="wake" ${ui.keepAwake ? 'checked' : ''}> 타이머 중 화면 켜두기</label>
    </div>
    <h2>오늘의 기록</h2>
    <div class="card">${sess.length ? sess.map((s) => `
      <div class="subj-row"><span class="swatch" style="--c:${subj(s.subjectId)?.color || '#B8A58F'}"></span>
      <span class="grow">${esc(subj(s.subjectId)?.name || '삭제된 과목')}<span class="muted small"> · ${pad(new Date(s.start).getHours())}:${pad(new Date(s.start).getMinutes())}</span></span>
      <span class="muted">${fmtMin(s.duration)}</span>
      <button class="icon-btn" data-a="sessdel" data-id="${s.id}" aria-label="삭제">×</button></div>`).join('') : '<div class="empty">아직 기록이 없어요.</div>'}</div>`;
}
function subClockText() {
  if (!timerActive()) return T.mode === 'pomo' ? '25분 집중 타이머' : '시작을 누르면 시간이 기록돼요';
  if (T.mode === 'pomo' && elapsed() >= POMO_MS) return '25분 집중 완료! 잠깐 쉬어도 좋아요';
  return T.runStart ? '집중 중' : '일시정지됨';
}
function tick() {
  const c = $('#clock');
  if (c) { c.textContent = clockText(); const s = $('#clock-sub'); if (s) s.textContent = subClockText(); }
  if (T.mode === 'pomo' && T.runStart && !T.notified && elapsed() >= POMO_MS) {
    T.notified = true; saveT();
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* 무시 */ }
    toast('25분 집중 완료! 🪵');
  }
}

// ───────────────────────── 화면: 기록 ─────────────────────────
function viewRec() {
  return `
    <div class="seg" style="margin-bottom:12px">
      <button data-a="rseg" data-s="interview" class="${ui.rseg === 'interview' ? 'on' : ''}">면접 Q&amp;A</button>
      <button data-a="rseg" data-s="note" class="${ui.rseg === 'note' ? 'on' : ''}">공부 일지</button>
    </div>
    ${ui.rseg === 'interview' ? viewInterview() : viewNotes()}`;
}

function filteredInterviews() {
  const q = ui.iq.trim().toLowerCase();
  return S.interviews
    .filter((i) => (!ui.itopic || i.topic === ui.itopic) && (!ui.istar || i.star)
      && (!q || [i.question, i.answer, i.memo, i.topic].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function interviewList() {
  const list = filteredInterviews();
  if (!list.length) return `<div class="empty">${S.interviews.length ? '조건에 맞는 기록이 없어요.' : 'AI와 나눈 면접 질문과 내 답변을 붙여넣어 보세요.'}</div>`;
  return list.map((i) => {
    const open = ui.openI === i.id;
    return `<div class="card item ${open ? '' : 'clamp'}" data-a="iopen" data-id="${i.id}">
      <div class="item-head">
        ${i.topic ? `<span class="chip">${esc(i.topic)}</span>` : ''}
        <span class="muted small">${dateLabel(i.date)}</span>
        <button class="star" data-a="istar" data-id="${i.id}" aria-label="즐겨찾기">${i.star ? '★' : '☆'}</button>
      </div>
      <div class="qa-q">${esc(i.question)}</div>
      ${i.answer ? `<div class="qa-a">${esc(i.answer)}</div>` : ''}
      ${open && i.memo ? `<div class="qa-memo">${esc(i.memo)}</div>` : ''}
      ${open ? `<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-a="iedit" data-id="${i.id}">수정</button><button class="btn danger sm" data-a="idel" data-id="${i.id}">삭제</button></div>` : ''}
    </div>`;
  }).join('<div style="height:10px"></div>');
}
function viewInterview() {
  const topics = [...new Set(S.interviews.map((i) => i.topic).filter(Boolean))];
  const e = ui.editI != null ? S.interviews.find((i) => i.id === ui.editI) : null;
  const form = (ui.showIForm || e) ? `
    <form class="card stack" data-form="interview" autocomplete="off" style="margin-bottom:12px">
      <input type="hidden" name="id" value="${e ? e.id : ''}">
      <div class="row">
        <div class="grow"><label class="f">날짜</label><input type="date" name="date" required value="${e ? e.date : today()}"></div>
        <div class="grow"><label class="f">주제 태그</label><input type="text" name="topic" list="topics" maxlength="20" placeholder="예: 교직관" value="${esc(e?.topic || '')}">
          <datalist id="topics">${topics.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
      </div>
      <div><label class="f">질문</label><textarea name="question" required placeholder="AI에게 받은 질문을 붙여넣어요">${esc(e?.question || '')}</textarea></div>
      <div><label class="f">내 답변</label><textarea name="answer" placeholder="내가 한 답변을 붙여넣어요" style="min-height:140px">${esc(e?.answer || '')}</textarea></div>
      <div><label class="f">보완할 점 (선택)</label><textarea name="memo" style="min-height:64px">${esc(e?.memo || '')}</textarea></div>
      <div class="row"><button class="btn grow" type="submit">${e ? '수정 저장' : '저장'}</button><button class="btn ghost" type="button" data-a="icancel">취소</button></div>
    </form>` : '<button class="btn block" data-a="iform" style="margin-bottom:12px">+ 새 면접 기록</button>';
  return `${form}
    <div class="row" style="margin-bottom:12px">
      <input type="text" class="grow" data-input="iq" placeholder="검색" value="${esc(ui.iq)}">
      <select data-change="itopic" style="width:auto"><option value="">전체 주제</option>${topics.map((t) => `<option ${t === ui.itopic ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <button class="btn ${ui.istar ? '' : 'ghost'} sm" data-a="istarfilter" aria-label="즐겨찾기만 보기">★</button>
    </div>
    <div id="ilist">${interviewList()}</div>
    ${S.interviews.length ? `<div class="muted small center" style="margin-top:12px">총 ${S.interviews.length}개 기록</div>` : ''}`;
}

function viewNotes() {
  const list = [...S.notes].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return `
    <form class="card stack" data-form="note" autocomplete="off">
      <div><label class="f">날짜</label><input type="date" name="date" required value="${today()}"></div>
      <div><label class="f">과목 (선택)</label>${subjPicker('note', ui.pick.note)}</div>
      <div><label class="f">오늘 공부한 내용</label><textarea name="text" required style="min-height:72px" placeholder="한두 줄로 간단히 남겨요"></textarea></div>
      <button class="btn block" type="submit">기록하기</button>
    </form>
    <h2>지난 일지</h2>
    ${list.length ? list.map((n) => `<div class="card">
      <div class="item-head"><span class="muted small">${dateLabel(n.date)}</span>${n.subjectId ? subjChip(n.subjectId) : ''}
      <button class="icon-btn" style="margin-left:auto" data-a="ndel" data-id="${n.id}" aria-label="삭제">×</button></div>
      <div style="white-space:pre-wrap;word-break:break-word">${esc(n.text)}</div></div>`).join('<div style="height:10px"></div>') : '<div class="empty">아직 일지가 없어요.</div>'}`;
}

// ───────────────────────── 화면: 통계 ─────────────────────────
function viewStat() {
  const m = minutesByDate();
  const td = today();
  const week = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(td, -i); week.push([d, m[d] || 0]); }
  const max = Math.max(...week.map((w) => w[1]), 60 * 1000);
  const weekSum = week.reduce((a, w) => a + w[1], 0);
  const monthKey = td.slice(0, 7);
  const monthSum = Object.entries(m).filter(([d]) => d.startsWith(monthKey)).reduce((a, [, v]) => a + v, 0);
  const allSum = Object.values(m).reduce((a, v) => a + v, 0);

  const from = ui.range === 'week' ? addDays(td, -6) : '0000-00-00';
  const by = {};
  S.sessions.filter((s) => s.date >= from).forEach((s) => { by[s.subjectId] = (by[s.subjectId] || 0) + s.duration; });

  // 선택한 달 통계
  const sm = ui.statMonth;
  const [sy, smo] = sm.split('-').map(Number);
  const mDays = new Date(sy, smo, 0).getDate();
  const daily = [];
  for (let d = 1; d <= mDays; d++) { const ds = `${sm}-${pad(d)}`; daily.push([d, m[ds] || 0, ds]); }
  const mTotal = daily.reduce((a, x) => a + x[1], 0);
  const studied = daily.filter((x) => x[1]);
  const best = studied.reduce((b, x) => (x[1] > b[1] ? x : b), [0, 0]);
  const mMax = Math.max(best[1], 60 * 1000);
  const mBy = {};
  S.sessions.filter((s) => s.date.startsWith(sm)).forEach((s) => { mBy[s.subjectId] = (mBy[s.subjectId] || 0) + s.duration; });
  const isNow = sm >= monthKey;

  return `
    <div class="stats">
      <div class="stat"><b>${fmtMin(weekSum)}</b><span>최근 7일</span></div>
      <div class="stat"><b>${fmtMin(monthSum)}</b><span>이번 달</span></div>
      <div class="stat"><b>${fmtMin(allSum)}</b><span>전체</span></div>
      <div class="stat"><b>${streak()}일</b><span>연속 공부</span></div>
    </div>
    <h2>최근 7일</h2>
    <div class="card"><div class="bars">${week.map(([d, v]) => `
      <div class="bar-col"><div class="bar-val">${v ? Math.round(v / 60000) + '분' : ''}</div>
      <div class="bar ${d === td ? 'today' : ''}" style="height:${Math.max(3, (v / max) * 100)}%"></div>
      <div class="bar-lbl">${DOW[parseYmd(d).getDay()]}</div></div>`).join('')}</div></div>
    <h2>월별 통계</h2>
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-a="smprev" aria-label="이전 달">‹</button>
        <div class="cal-title">${sy}년 ${smo}월</div>
        <button class="icon-btn" data-a="smnext" aria-label="다음 달" ${isNow ? 'disabled style="opacity:.3"' : ''}>›</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${fmtMin(mTotal)}</b><span>총 공부 시간</span></div>
        <div class="stat"><b>${studied.length}일</b><span>공부한 날 (${mDays}일 중)</span></div>
        <div class="stat"><b>${studied.length ? fmtMin(mTotal / studied.length) : '-'}</b><span>공부한 날 하루 평균</span></div>
        <div class="stat"><b>${best[1] ? fmtMin(best[1]) : '-'}</b><span>최고 기록${best[1] ? ` (${smo}/${best[0]})` : ''}</span></div>
      </div>
      <div class="bars dense">${daily.map(([d, v, ds]) => `
        <div class="bar-col" title="${smo}/${d} ${v ? fmtMin(v) : ''}">
        <div class="bar ${v ? '' : 'zero'} ${ds === td ? 'today' : ''}" style="height:${v ? Math.max(4, (v / mMax) * 100) : 2}%"></div>
        <div class="bar-lbl">${d === 1 || d % 5 === 0 ? d : ''}</div></div>`).join('')}</div>
      ${Object.keys(mBy).length ? `<div style="margin-top:10px">${subjBars(mBy)}</div>` : '<div class="empty">이 달에는 공부 기록이 없어요.</div>'}
    </div>
    <h2>과목별 시간</h2>
    <div class="seg" style="margin-bottom:10px">
      ${[['week', '최근 7일'], ['all', '전체']].map(([k, l]) => `<button data-a="range" data-r="${k}" class="${ui.range === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div class="card">${Object.keys(by).length ? subjBars(by) : '<div class="empty">기록이 쌓이면 여기에 나타나요.</div>'}</div>`;
}

function subjBars(by) {
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const top = rows.length ? rows[0][1] : 1;
  return rows.map(([id, ms]) => `
    <div style="padding:8px 0"><div class="row"><span class="swatch" style="--c:${subj(+id)?.color || '#B8A58F'}"></span>
    <span class="grow">${esc(subj(+id)?.name || '삭제된 과목')}</span><span class="muted">${fmtMin(ms)}</span></div>
    <div class="hbar" style="--c:${subj(+id)?.color || '#B8A58F'}"><i style="width:${(ms / top) * 100}%"></i></div></div>`).join('');
}

// ───────────────────────── 화면: 설정 ─────────────────────────
function viewSettings() {
  return `
    <h2>과목 관리</h2>
    <div class="card">
      ${S.subjects.length ? S.subjects.map((s) => `<div class="subj-row"><span class="swatch" style="--c:${s.color}"></span>
        <span class="grow">${esc(s.name)}</span><button class="icon-btn" data-a="subjdel" data-id="${s.id}" aria-label="삭제">×</button></div>`).join('') : '<div class="empty">과목이 없어요.</div>'}
      <form class="row" data-form="subject" style="margin-top:10px" autocomplete="off">
        <input type="text" name="name" required maxlength="20" placeholder="새 과목 이름" class="grow">
        <button class="btn" type="submit">추가</button>
      </form>
    </div>
    <h2>데이터 백업</h2>
    <div class="card stack">
      <div class="muted small">데이터는 이 기기의 브라우저 안에만 저장돼요. 앱 삭제나 사이트 데이터 삭제 시 사라질 수 있으니 가끔 백업 파일을 저장해 두세요.</div>
      <div class="row"><button class="btn grow" data-a="export">백업 파일 저장</button><button class="btn ghost grow" data-a="import">백업 불러오기</button></div>
    </div>
    <div style="height:14px"></div>
    <button class="btn ghost block" data-a="tab" data-t="home">← 돌아가기</button>`;
}

// ───────────────────────── 렌더링 ─────────────────────────
const VIEWS = { home: viewHome, cal: viewCal, timer: viewTimer, rec: viewRec, stat: viewStat, settings: viewSettings };
function render() {
  $('#view').innerHTML = VIEWS[ui.tab]();
  $('#tabs').innerHTML = `<div class="inner">${TABS.map(([k, l, ic]) =>
    `<button class="tab ${ui.tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${svg(ic)}${l}</button>`).join('')}</div>`;
  $('#btn-settings').innerHTML = svg('gear');
}
const go = (tab) => { ui.tab = tab; render(); window.scrollTo(0, 0); };

// ───────────────────────── 동작 ─────────────────────────
const nextColor = () => COLORS[S.subjects.length % COLORS.length];

const actions = {
  tab: (a) => go(a.dataset.t),
  settings: () => go('settings'),

  calprev: () => { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = ymd(new Date(y, m - 2, 1)).slice(0, 7); render(); },
  calnext: () => { const [y, m] = ui.calMonth.split('-').map(Number); ui.calMonth = ymd(new Date(y, m, 1)).slice(0, 7); render(); },
  caltoday: () => { ui.calMonth = today().slice(0, 7); ui.selDate = today(); render(); },
  pick: (a) => { ui.selDate = a.dataset.d; render(); },

  async todotoggle(a) {
    const t = S.todos.find((x) => x.id === +a.dataset.id);
    if (t) {
      t.done = !t.done;
      await dbPut('todos', t); await refresh('todos'); render();
      if (t.done) toast('해냈어요! 👏');
    }
  },
  async tododel(a) { await dbDel('todos', +a.dataset.id); await refresh('todos'); render(); },

  mode: (a) => { if (!timerActive()) { T.mode = a.dataset.m; saveT(); render(); } },
  tstart() {
    const sel = $('select[data-change="tsubj"]');
    const sid = sel ? +sel.value : (T.subjectId ?? S.subjects[0]?.id);
    if (!sid) return toast('먼저 과목을 추가해 주세요');
    T = { ...blankTimer(T.mode, sid), startedAt: Date.now(), runStart: Date.now() };
    saveT();
    if (ui.keepAwake) setWake(true);
    render();
  },
  tpause() { T.acc = elapsed(); T.runStart = null; saveT(); setWake(false); render(); },
  tresume() { T.runStart = Date.now(); saveT(); if (ui.keepAwake) setWake(true); render(); },
  async tstop() {
    const el = elapsed();
    const sid = T.subjectId;
    if (el < 60000) {
      toast('1분 미만은 기록하지 않아요');
    } else {
      await dbPut('sessions', { subjectId: sid, date: ymd(new Date(T.startedAt)), start: T.startedAt, end: Date.now(), duration: el });
      await refresh('sessions');
      toast(`${fmtMin(el)} 기록했어요`);
    }
    T = blankTimer(T.mode, sid);
    saveT(); setWake(false); render();
  },
  async sessdel(a) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    await dbDel('sessions', +a.dataset.id); await refresh('sessions'); render();
  },

  rseg: (a) => { ui.rseg = a.dataset.s; render(); },
  iform: () => { ui.showIForm = true; ui.editI = null; render(); },
  icancel: () => { ui.showIForm = false; ui.editI = null; render(); },
  iopen: (a) => { ui.openI = ui.openI === +a.dataset.id ? null : +a.dataset.id; renderIList(); },
  iedit: (a) => { ui.editI = +a.dataset.id; ui.showIForm = true; render(); window.scrollTo(0, 0); },
  async istar(a, e) {
    e.stopPropagation();
    const i = S.interviews.find((x) => x.id === +a.dataset.id);
    if (i) { i.star = !i.star; await dbPut('interviews', i); await refresh('interviews'); renderIList(); }
  },
  istarfilter: () => { ui.istar = !ui.istar; render(); },
  async idel(a, e) {
    e.stopPropagation();
    if (!confirm('이 면접 기록을 삭제할까요?')) return;
    await dbDel('interviews', +a.dataset.id); ui.openI = null; await refresh('interviews'); render();
  },
  async ndel(a) {
    if (!confirm('이 일지를 삭제할까요?')) return;
    await dbDel('notes', +a.dataset.id); await refresh('notes'); render();
  },

  range: (a) => { ui.range = a.dataset.r; render(); },
  smprev: () => { const [y, m] = ui.statMonth.split('-').map(Number); ui.statMonth = ymd(new Date(y, m - 2, 1)).slice(0, 7); render(); },
  smnext: () => {
    const [y, m] = ui.statMonth.split('-').map(Number);
    const next = ymd(new Date(y, m, 1)).slice(0, 7);
    if (next <= today().slice(0, 7)) { ui.statMonth = next; render(); }
  },

  subjadd(a) {
    ui.subjAdd = ui.subjAdd === a.dataset.k ? null : a.dataset.k;
    keepDraft(a, () => render()).then(() => $('#subj-new')?.focus());
  },
  async subjsave(a) {
    const key = a.dataset.k;
    const inp = $('#subj-new');
    const name = inp?.value.trim();
    if (!name) { inp?.focus(); return; }
    await keepDraft(a, async () => {
      let s = S.subjects.find((x) => x.name === name);
      if (!s) {
        const id = await dbPut('subjects', { name, color: nextColor() });
        await refresh('subjects');
        s = subj(id);
        toast(`'${name}' 과목을 추가했어요`);
      }
      if (key === 'timer') ui.timerSubject = s.id; else ui.pick[key] = s.id;
      ui.subjAdd = null;
      render();
    });
  },

  async subjdel(a) {
    const s = subj(+a.dataset.id);
    if (!s || !confirm(`'${s.name}' 과목을 삭제할까요?\n이미 쌓인 기록은 '삭제된 과목'으로 남아요.`)) return;
    await dbDel('subjects', s.id); await refresh('subjects'); render();
  },

  async export() {
    const data = { app: 'FirstChalk', version: 1, exportedAt: new Date().toISOString() };
    for (const s of STORES) data[s] = S[s];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `firstchalk-backup-${today()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('백업 파일을 저장했어요');
  },
  import: () => $('#import-file').click()
};

function renderIList() {
  const box = $('#ilist');
  if (box) box.innerHTML = interviewList(); else render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  const fn = actions[a.dataset.a];
  if (fn) fn(a, e);
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'subjectId') {
    const formKind = e.target.closest('form')?.dataset.form;
    if (formKind in ui.pick) ui.pick[formKind] = e.target.value ? +e.target.value : null;
  }
  const k = e.target.dataset.change;
  if (!k) return;
  if (k === 'tsubj') { ui.timerSubject = +e.target.value; }
  if (k === 'itopic') { ui.itopic = e.target.value; renderIList(); }
  if (k === 'wake') {
    ui.keepAwake = e.target.checked;
    if (T.runStart) setWake(ui.keepAwake);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.input === 'iq') { ui.iq = e.target.value; renderIList(); }
});

// 새 과목 입력칸에서 Enter = 추가 (한글 조합 중에는 무시)
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'subj-new' && e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    $('[data-a="subjsave"]')?.click();
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const kind = form.dataset.form;

  if (kind === 'todo') {
    await dbPut('todos', {
      title: f.get('title').trim(), memo: f.get('memo').trim(), date: ui.selDate,
      subjectId: f.get('subjectId') ? +f.get('subjectId') : null, done: false
    });
    await refresh('todos'); render(); toast('할 일을 추가했어요');
  } else if (kind === 'todo-today') {
    await dbPut('todos', { title: f.get('title').trim(), memo: '', date: today(), subjectId: null, done: false });
    await refresh('todos'); render(); toast('오늘 할 일에 추가했어요');
  } else if (kind === 'subject') {
    const name = f.get('name').trim();
    if (!name) return;
    if (S.subjects.some((s) => s.name === name)) return toast('이미 있는 과목이에요');
    await dbPut('subjects', { name, color: nextColor() });
    await refresh('subjects'); render();
  } else if (kind === 'interview') {
    const id = f.get('id');
    const old = id ? S.interviews.find((i) => i.id === +id) : null;
    const rec = {
      ...(old || { star: false }),
      date: f.get('date'), topic: f.get('topic').trim(), question: f.get('question').trim(),
      answer: f.get('answer').trim(), memo: f.get('memo').trim()
    };
    await dbPut('interviews', rec);
    await refresh('interviews');
    ui.showIForm = false; ui.editI = null; render(); toast('저장했어요');
  } else if (kind === 'note') {
    await dbPut('notes', {
      date: f.get('date'), text: f.get('text').trim(),
      subjectId: f.get('subjectId') ? +f.get('subjectId') : null
    });
    await refresh('notes'); render(); toast('일지를 남겼어요');
  }
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'FirstChalk' || !STORES.every((s) => Array.isArray(data[s]))) throw new Error('형식 오류');
    if (!confirm('현재 데이터가 백업 파일의 내용으로 교체돼요. 계속할까요?')) return;
    for (const s of STORES) {
      await dbClear(s);
      for (const row of data[s]) await dbPut(s, row);
      await refresh(s);
    }
    toast('백업을 불러왔어요'); render();
  } catch {
    toast('올바른 FirstChalk 백업 파일이 아니에요');
  }
});

// ───────────────────────── 시작 ─────────────────────────
(async function init() {
  try {
    await Promise.all(STORES.map(refresh));
  } catch {
    toast('저장소를 열 수 없어요. 시크릿 모드인지 확인해 주세요.');
  }
  try { navigator.storage?.persist?.(); } catch { /* 무시 */ }
  if (T.startedAt && T.runStart && ui.keepAwake) setWake(true);
  render();
  setInterval(tick, 1000);
  if ('serviceWorker' in navigator) {
    // 새 버전이 설치되면 한 번 자동으로 새로고침해서 바로 반영
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  }
})();
