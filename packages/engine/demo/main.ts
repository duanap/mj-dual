// 两人两杠起胡麻将 · 人机对战（本地） + 联机对战（@mj/server）
// 规则全部由 packages/engine 纯函数引擎校验。联机遵循架构文档：客户端只发意图，
// 座位由服务端分配，状态由服务端按玩家视角过滤后下发（PlayerView）。
import { io, type Socket } from 'socket.io-client';
import type { Action, GameEvent, GameState, RNG, Seat, Tile } from '../src/index';
import { applyAction, availableActions, currentActors, newMatch, suggestAction } from '../src/index';
import type { RoomGameView, RoomSnapshot } from '../../server/src/protocol';
import { backHTML, tileFaceHTML, tileText } from './tiles';
import { isMuted, setMuted, sfx } from './audio';
import { DiscardSelection, discardTargets } from './selection';
import { renderRoomDialog } from './room-ui';

// 浏览器 CSPRNG：crypto.getRandomValues + 拒绝采样（与生产随机源纪律一致）
const rng: RNG = {
  int(n: number): number {
    if (n <= 0) throw new Error(`RNG.int 需要正整数，收到 ${n}`);
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0]! < limit) return buf[0]! % n;
    }
  },
};

let state: GameState = newMatch(rng);
let me: Seat = 0;
let opp: Seat = 1;
let gen = 0; // 本地 AI 定时器代数
let history: string[] = [];
let lastDiscard: Tile | null = null;
let lastRound = -1;
let localResultRound = -1;
let flashMsg = '';
type ModalKind = 'room' | 'river' | 'records' | 'settlement';
let modal: ModalKind | null = null;
let modalReturnFocusId: string | null = null;
let onlineError = '';
let roomRequestPending = false;
let yourActions: Action[] = [];
const selection = new DiscardSelection();
let discardMap = new Map<number, number>();
const selectionContext = (): string => `${online?.code ?? `local:${gen}`}:${state.round}:${state.seq}`;
const legalDiscards = (): number[] => [...discardMap.keys()];

interface Online {
  socket: Socket;
  code: string;
  token: string;
  snapshot: RoomSnapshot | null;
  roomError: string;
  pendingControl: boolean;
}
let online: Online | null = null;
let view: RoomGameView | null = null;

const SUIT_TEXT = { tong: '筒', tiao: '条' } as const;
const seatName = (s: Seat): string => (s === me ? '你' : '对手');
const flowerChip = (s: Seat): string => {
  const f = state.flowers[s];
  return f ? `<i class="fchip ${f}">${SUIT_TEXT[f]}</i>` : '<i class="fchip none">?</i>';
};

/* ---------------- 模式：本地 AI / 联机 ---------------- */

function goLocal(): void {
  selection.reset();
  modal = null;
  if (online) {
    online.socket.disconnect();
    online = null;
  }
  view = null;
  sessionStorage.removeItem('mj-room');
  me = 0;
  opp = 1;
  gen++;
  state = newMatch(rng);
  history = [];
  lastDiscard = null;
  lastRound = -1;
  render();
  scheduleNext();
}

function viewToState(v: RoomGameView): GameState {
  const other = (1 - v.you) as Seat;
  const ph = (i: number): Tile => ({ id: -10000 - i, suit: 'tong', rank: 1 });
  const otherHand = v.reveal ? v.reveal[other] : Array.from({ length: v.otherHandCount }, (_, i) => ph(i));
  return {
    round: v.round,
    phase: v.phase,
    banker: v.banker,
    turn: v.turn,
    flowers: v.flowers,
    hands: v.you === 0 ? [v.hand, otherHand] : [otherHand, v.hand],
    melds: v.melds,
    rivers: v.rivers,
    wall: Array.from({ length: v.wallCount }, (_, i) => ph(100 + i)),
    drawnTile: v.drawnTile,
    claimable: false,
    pending: v.pending,
    passTiles: v.you === 0 ? [v.passTiles, []] : [[], v.passTiles],
    ready: [false, false],
    result: v.result,
    tally: v.tally,
    seq: v.seq,
  };
}

function consumeEvents(events: GameEvent[]): void {
  for (const e of events) {
    history.unshift(fmtEvent(e));
    sfxFor(e);
  }
  if (history.length > 120) history.length = 120;
}

function onRoomSnapshot(snapshot: RoomSnapshot): void {
  if (!online || online.code !== snapshot.code) return;
  const previousPhase = online.snapshot?.phase ?? null;
  online.snapshot = snapshot;
  me = snapshot.you;
  opp = (1 - snapshot.you) as Seat;
  if (snapshot.view) {
    view = snapshot.view;
    consumeEvents(snapshot.view.events);
    state = viewToState(snapshot.view);
  }
  if (snapshot.phase === 'finished' && previousPhase !== 'finished') modal = 'settlement';
  if ((previousPhase === 'waiting' || previousPhase === 'finished') && snapshot.phase === 'playing') modal = null;
  render();
}

function connectOnline(): Socket {
  const socket = io({ reconnectionAttempts: 5, transports: ['websocket', 'polling'], auth: { protocol: 2 } });
  socket.on('room:snapshot', onRoomSnapshot);
  socket.on('room:peer', (p: { seat: Seat; connected: boolean }) => {
    flash(p.connected ? '对手已上线' : '对手掉线，自动托管中');
    render();
  });
  socket.on('room:kicked', () => {
    flash('对局已在其他页面打开，本页返回人机模式');
    goLocal();
  });
  socket.on('room:closed', (closed: { code: string; reason: string }) => {
    if (!online || online.code !== closed.code) return;
    goLocal();
    flash(closed.reason === 'dissolved' ? '房间已解散' : '已退出房间');
    render();
  });
  socket.on('protocol:upgrade-required', (result: { message?: string }) => {
    sessionStorage.removeItem('mj-room');
    if (online?.socket === socket) online = null;
    view = null;
    modal = null;
    flash(result.message ?? '页面已更新，请刷新后重新加入房间');
    render();
  });
  socket.on('disconnect', () => {
    if (online) {
      flash('连接断开，正在重连…');
      render();
    }
  });
  socket.on('connect_error', () => {
    if (!online) {
      roomRequestPending = false;
      onlineError = '联机服务不可用，请稍后重试';
      flash('联机服务不可用（请确认服务端已启动：npm run server）');
      render();
    }
  });
  return socket;
}

function applyJoined(socket: Socket, res: any, showRoom = true): void {
  roomRequestPending = false;
  if (res.error) {
    socket.disconnect();
    sessionStorage.removeItem('mj-room');
    flash(`加入失败：${res.error}`);
    onlineError = res.message ?? res.error;
    modal = 'room';
    render();
    return;
  }
  gen++; // 停掉本地 AI
  onlineError = '';
  online = { socket, code: res.code, token: res.token, snapshot: null, roomError: '', pendingControl: false };
  sessionStorage.setItem('mj-room', JSON.stringify({ code: res.code, token: res.token }));
  onRoomSnapshot(res.snapshot);
  if ((showRoom || res.snapshot.phase === 'waiting') && res.snapshot.phase !== 'finished') modal = 'room';
  render();
}

function createRoom(): void {
  if (roomRequestPending) return;
  roomRequestPending = true;
  onlineError = '';
  const socket = connectOnline();
  flash('正在创建房间…');
  render();
  socket.once('connect', () => {
    socket.timeout(5000).emit('room:create', (err: Error | null, res: any) =>
      applyJoined(socket, err ? { error: 'REQUEST_TIMEOUT', message: '创建请求超时' } : res),
    );
  });
}

function joinRoom(code: string): void {
  if (roomRequestPending) return;
  roomRequestPending = true;
  onlineError = '';
  const socket = connectOnline();
  flash('正在加入房间…');
  render();
  socket.once('connect', () => {
    socket.timeout(5000).emit('room:join', { code }, (err: Error | null, res: any) =>
      applyJoined(socket, err ? { error: 'REQUEST_TIMEOUT', message: '加入请求超时' } : res),
    );
  });
}

function rejoin(code: string, token: string): void {
  const socket = connectOnline();
  socket.once('connect', () => {
    socket.timeout(5000).emit('room:rejoin', { code, token }, (err: Error | null, res: any) =>
      applyJoined(socket, err ? { error: 'REQUEST_TIMEOUT', message: '重连超时' } : res, false),
    );
  });
}

function openModal(kind: ModalKind): void {
  if (modal == null) modalReturnFocusId = (document.activeElement as HTMLElement | null)?.id || 'roombtn';
  modal = kind;
  render();
  if (kind === 'room' && online?.socket.connected) {
    online.socket.timeout(5000).emit('room:info', (err: Error | null, result: any) => {
      if (!online || online.socket.connected === false) return;
      if (err || !result?.ok) online.roomError = err ? '获取房间信息超时' : result?.message ?? '获取房间信息失败';
      else {
        online.roomError = '';
        if (result.snapshot) onRoomSnapshot(result.snapshot);
      }
      render();
    });
  }
}

function closeModal(): void {
  if (!modal) return;
  const returnFocus = modalReturnFocusId;
  modal = null;
  modalReturnFocusId = null;
  render();
  if (returnFocus) document.getElementById(returnFocus)?.focus({ preventScroll: true });
  if (!online) scheduleNext();
}

function joinFromDialog(): void {
  const code = (document.getElementById('room-code') as HTMLInputElement | null)?.value.trim().toUpperCase() ?? '';
  if (code.length === 4) joinRoom(code);
}

function roomControl(action: 'start' | 'leave' | 'dissolve' | 'rematch'): void {
  const current = online;
  if (!current || current.pendingControl) return;
  current.pendingControl = true;
  current.roomError = '';
  render();
  current.socket.timeout(5000).emit(`room:${action}`, (err: Error | null, result: any) => {
    if (online !== current) return;
    current.pendingControl = false;
    if (err || !result?.ok) {
      current.roomError = err ? '操作确认超时，请检查房间状态后重试' : result?.message ?? '房间操作失败';
      render();
      return;
    }
    current.roomError = '';
    if (result.snapshot) onRoomSnapshot(result.snapshot);
    if (action === 'start' || action === 'rematch') modal = null;
    render();
  });
}

function handleModalAction(action: string): void {
  switch (action) {
    case 'room-create': createRoom(); break;
    case 'room-join': joinFromDialog(); break;
    case 'room-start': roomControl('start'); break;
    case 'room-rematch': roomControl('rematch'); break;
    case 'room-leave': roomControl('leave'); break;
    case 'room-dissolve': roomControl('dissolve'); break;
    case 'open-room': openModal('room'); break;
    case 'local-next': doAction({ type: 'ready', seat: me }); break;
  }
}

// 页面加载：有保存的房间则自动重连
try {
  const saved = sessionStorage.getItem('mj-room');
  if (saved) {
    const { code, token } = JSON.parse(saved) as { code: string; token: string };
    rejoin(code, token);
  }
} catch {
  sessionStorage.removeItem('mj-room');
}

/* ---------------- 行为 ---------------- */

function doAction(a: Action): void {
  if (selection.locked) return;
  selection.reset();
  if (online) {
    if (!online.socket.connected) {
      flash('连接恢复后再操作');
      render();
      return;
    }
    selection.lock();
    const context = selectionContext();
    online.socket.timeout(5000).emit('action', a, (err: Error | null, res: any) => {
      if (err || res?.ok === false) {
        if (selectionContext() !== context) return;
        selection.reset();
        flash(err ? '暂未收到操作确认，请等待同步后重试' : res.message ?? '操作被拒绝');
        render();
      }
    });
    render();
    return;
  }
  applyLocal(a);
}

function applyLocal(a: Action): void {
  try {
    const res = applyAction(state, a, rng);
    state = res.state;
    consumeEvents(res.events);
    flash('');
  } catch (err) {
    flash(err instanceof Error ? err.message : String(err));
  }
  render();
  scheduleNext();
}

function scheduleNext(): void {
  if (online || modal) return; // 联机由服务端驱动；弹窗打开时暂停本地对局
  const myGen = gen;
  if (state.phase === 'settlement') {
    if (currentActors(state).includes(opp)) {
      setTimeout(() => {
        if (myGen === gen && state.phase === 'settlement') applyLocal({ type: 'ready', seat: opp });
      }, 1100);
    }
    return;
  }
  if (currentActors(state).includes(opp)) {
    setTimeout(() => {
      if (myGen !== gen || modal) return;
      applyLocal(suggestAction(state, opp, rng));
    }, state.phase === 'respond' ? 950 : 720);
  }
}

function newGame(): void {
  if (online) return;
  gen++;
  selection.reset();
  modal = null;
  state = newMatch(rng);
  history = [];
  lastDiscard = null;
  lastRound = -1;
  render();
  scheduleNext();
}

/* ---------------- 事件文本 / 音效 ---------------- */

function fmtEvent(e: GameEvent): string {
  switch (e.type) {
    case 'round_started': return `—— 第 ${e.round} 局开始，庄家：${seatName(e.banker)} ——`;
    case 'flower_chosen': return `${seatName(e.seat)} 定花：${SUIT_TEXT[e.suit]}`;
    case 'exchanged': return `定花交换：庄家垫 ${e.bankerWild} 张，闲家垫 ${e.otherWild} 张`;
    case 'drawn': return `${seatName(e.seat)} 摸牌`;
    case 'discarded': return `${seatName(e.seat)} 打出 ${tileText(e.tile)}`;
    case 'peng': return `${seatName(e.seat)} 碰 ${tileText(e.tile)}`;
    case 'gang': return `${seatName(e.seat)} ${e.kind === 'ming' ? '明杠' : e.kind === 'an' ? '暗杠' : '补杠'} ${tileText(e.tile)}`;
    case 'replacement_drawn': return `${seatName(e.seat)} 杠后补牌`;
    case 'hu': return `${seatName(e.seat)} ${e.kind === 'zimo' ? '自摸' : '点炮'}胡 ${tileText(e.tile)}！`;
    case 'draw_game': return `流局（${e.reason === 'wall_empty' ? '牌墙已空' : '杠后无牌可补'}）`;
    case 'round_settled': return e.result.winner == null ? '本局流局' : `${seatName(e.result.winner)} 胡牌`;
    case 'next_round': return `—— 第 ${e.round} 局，庄家：${seatName(e.banker)} ——`;
  }
}

function sfxFor(e: GameEvent): void {
  switch (e.type) {
    case 'discarded':
      sfx.discard();
      lastDiscard = e.tile;
      break;
    case 'drawn':
    case 'replacement_drawn':
      sfx.draw();
      break;
    case 'peng':
    case 'gang':
      sfx.claim();
      break;
    case 'hu':
      sfx.hu();
      break;
    case 'draw_game':
      sfx.drawGame();
      break;
    case 'round_started':
      lastDiscard = null;
      break;
  }
}

function flash(msg: string): void {
  flashMsg = msg;
}

/* ---------------- 渲染 ---------------- */

function handHTML(seat: Seat, dealing: boolean): string {
  if (online && !view) return '';
  const hand = state.hands[seat];
  if (seat === opp) {
    const reveal = state.phase === 'settlement';
    return hand
      .map((t, i) => {
        const delay = dealing ? ` style="animation-delay:${i * 28}ms"` : '';
        return reveal && t.id >= 0
          ? tileFaceHTML(t, 't-sm')
          : `<span class="twrap"${delay}>${backHTML('t-sm')}</span>`;
      })
      .join('');
  }
  const canPlay = state.phase === 'act' && state.turn === me && yourActions.some((a) => a.type === 'discard');
  const suitOrder = (t: Tile): number => t.suit === (state.flowers[me] ?? 'tong') ? 0 : 1;
  const sorted = [...hand].sort((a, b) => {
    if (a.id === state.drawnTile?.id) return 1;
    if (b.id === state.drawnTile?.id) return -1;
    return suitOrder(a) - suitOrder(b) || a.rank - b.rank || a.id - b.id;
  });
  return sorted
    .map((t, i) => {
      const drawn = state.drawnTile?.id === t.id;
      const selected = selection.id === t.id;
      const cls = 't-lg' + (drawn ? ' drawn' : '') + (selected ? ' selected' : '');
      const delay = dealing ? ` style="animation-delay:${i * 35}ms"` : '';
      return canPlay && t.id >= 0
        ? `<button class="tbtn${drawn ? ' drawn-slot' : ''}"${delay} data-discard="${t.id}" aria-label="${tileText(t)}，${selected ? '再次点击打出' : '点击选择'}" aria-pressed="${selected}" ${selection.locked ? 'disabled' : ''}>${tileFaceHTML(t, cls)}</button>`
        : `<span class="twrap${drawn ? ' drawn-slot' : ''}"${delay}>${tileFaceHTML(t, cls)}</span>`;
    })
    .join('');
}

function meldsHTML(seat: Seat): string {
  if (online && !view) return '';
  return state.melds[seat]
    .map((m) => {
      const label = m.type === 'peng' ? '碰' : m.concealed ? '暗杠' : m.upgraded ? '补杠' : '明杠';
      const hide = seat === opp && m.concealed && state.phase !== 'settlement'; // 结算亮牌
      const tiles = m.tiles.map((t) => (hide || t.id < 0 ? backHTML('t-xs') : tileFaceHTML(t, 't-xs'))).join('');
      return `<span class="meld">${tiles}<i>${label}</i></span>`;
    })
    .join('');
}

function riverHTML(seat: Seat, full = false): string {
  if (online && !view) return '';
  const all = state.rivers[seat];
  // 手机横屏（矮视口）只保留最近 6 张，避免中央区溢出
  const compact = Math.min(window.innerWidth, window.innerHeight) <= 560;
  const r = compact && !full ? all.slice(-6) : all;
  return r.map((t, i) => tileFaceHTML(t, 't-sm', i === r.length - 1 && all.length > 0 ? 'latest' : '')).join('');
}

function actionLabel(a: Action, seat: Seat): string {
  switch (a.type) {
    case 'choose_flower': return `定花 ${SUIT_TEXT[a.suit]}`;
    case 'peng': return '碰';
    case 'pass': return '过';
    case 'ready': return '就绪';
    case 'hu': return state.phase === 'act' ? '自摸胡！' : '胡！';
    case 'gang': {
      if (a.tileId != null) {
        const t = state.hands[seat].find((x) => x.id === a.tileId);
        return `${a.kind === 'an' ? '暗杠' : '补杠'}${t ? ` ${tileText(t)}` : ''}`;
      }
      return '明杠';
    }
    default: return a.type;
  }
}

function phaseHint(): string {
  if (online && !view) {
    return online.snapshot?.members[1].connected ? '等待房主开始对局' : '等待玩家加入房间';
  }
  switch (state.phase) {
    case 'choose_flower': return state.turn === me ? '请选择你的花色（定花）' : '对手正在定花…';
    case 'act': {
      if (state.turn !== me) return '对手思考中…';
      if (selection.locked) return '操作确认中…';
      const tile = state.hands[me].find((t) => t.id === selection.id);
      return tile ? `已选 ${tileText(tile)} · 再点一次打出` : '轮到你 · 点牌选择，再点打出';
    }
    case 'respond': {
      const t = state.pending ? tileText(state.pending.tile) : '';
      return state.turn === me ? `对手打出 ${t} · 请选择操作或「过」` : `你打出 ${t} · 对手响应中…`;
    }
    case 'settlement': return '本局结束';
  }
}

function overlayHTML(): string {
  if (!modal) return '';
  let body = '';
  let label = '对话框';
  let className = '';
  if (modal === 'room') {
    label = '房间';
    body = renderRoomDialog(online?.snapshot ?? null, online?.roomError || onlineError);
  } else if (modal === 'river') {
    label = '完整牌河';
    className = 'river-card';
    body = `<h2>完整牌河</h2><div class="river-history">
      <h3>对手 · ${state.rivers[opp].length} 张</h3><div class="river full">${riverHTML(opp, true)}</div>
      <h3>你 · ${state.rivers[me].length} 张</h3><div class="river full">${riverHTML(me, true)}</div></div>`;
  } else if (modal === 'records') {
    label = '对局记录';
    body = `<h2>对局记录</h2><div class="records-list">${history.length ? history.map((entry) => `<p>${entry}</p>`).join('') : '<p class="dim">本局还没有记录</p>'}</div>`;
  } else if (state.phase === 'settlement' && state.result) {
    label = '本局结算';
    className = 'result-card';
    const result = state.result;
    const title = result.winner == null ? '流 局' : `${result.winner === me ? '🎉' : '💦'} ${seatName(result.winner)}胡了！`;
    const sub = result.winner == null
      ? result.reason === 'gang_no_replacement' ? '杠后无牌可补' : '牌墙已摸空'
      : `${result.kind === 'zimo' ? '自摸' : '点炮'}胡 · 胡牌张 ${result.tile ? tileText(result.tile) : ''}`;
    const hands = ([me, opp] as Seat[])
      .map((seat) => `<div class="rev"><b>${seatName(seat)}${flowerChip(seat)}</b>${state.hands[seat].filter((tile) => tile.id >= 0).map((tile) => tileFaceHTML(tile, 't-xs')).join('')}</div>`)
      .join('');
    const resultActions = online
      ? snapshotIsHost()
        ? `<button class="abtn hu" data-action="room-rematch" ${online.snapshot?.canRematch ? '' : 'disabled'}>再来一局</button><button class="ghost" data-action="open-room">房间信息</button>`
        : '<p class="room-waiting">等待房主再来一局</p><button class="ghost" data-action="open-room">房间信息</button>'
      : '<button class="abtn hu" data-action="local-next">下一局</button>';
    body = `<h2>${title}</h2><p>${sub}</p>${hands}
      <p class="tally">战绩 —— 你 <b>${state.tally.wins[me]}</b> 胜 · 对手 <b>${state.tally.wins[opp]}</b> 胜 · 流局 ${state.tally.draws}</p>
      <div class="room-actions">${resultActions}</div>`;
  }
  return `<div class="overlay" data-modal-backdrop><div class="card ${className}" role="dialog" aria-modal="true" aria-label="${label}">
    <button type="button" class="dialog-close" data-modal-close aria-label="关闭${label}">×</button>${body}
  </div></div>`;
}

function snapshotIsHost(): boolean {
  return !!online?.snapshot && online.snapshot.you === online.snapshot.host;
}

function render(): void {
  if (!online && state.phase === 'settlement' && modal == null && localResultRound !== state.round) {
    modal = 'settlement';
    localResultRound = state.round;
  }
  if (state.phase !== 'settlement') localResultRound = -1;
  const focusedId = document.activeElement?.id;
  const previousCode = document.getElementById('room-code') as HTMLInputElement | null;
  const codeDraft = previousCode?.value;
  const codeCursor = previousCode ? [previousCode.selectionStart, previousCode.selectionEnd] : null;
  yourActions = online ? (view?.yourActions ?? []) : availableActions(state, me);
  discardMap = discardTargets(state.hands[me], yourActions);
  selection.sync(selectionContext(), legalDiscards());
  let abtns = '';
  if (state.phase !== 'settlement') {
    for (const a of yourActions) {
      if (a.type === 'discard') continue;
      abtns += `<button class="abtn ${a.type}" data-idx="${yourActions.indexOf(a)}" ${selection.locked ? 'disabled' : ''}>${actionLabel(a, me)}</button>`;
    }
  }

  const dealing = state.round !== lastRound;
  lastRound = state.round;

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="topbar">
      <span class="brand">双人麻将</span><span class="stat mode">${online ? '好友对战' : '人机练习'}</span><span class="stat">${online && !view ? '等待开局' : `第 ${state.round} 局`}</span>
      ${online && !view ? '' : `<span class="stat">庄 ${seatName(state.banker)}</span>`}
      ${online && !view ? '' : `<span class="stat score">${state.tally.wins[me]}胜${state.tally.wins[opp]}负${state.tally.draws}流</span>`}
      <span class="spacer"></span>
      <button id="roombtn" class="ghost">${online ? `房间 · ${online.code}` : '房间'}</button>
      ${state.phase === 'settlement' && modal !== 'settlement' ? '<button id="resultbtn" class="ghost">本局结果</button>' : ''}
      <button id="riverbtn" class="ghost" aria-expanded="${modal === 'river'}">牌河</button>
      <button id="logbtn" class="ghost">记录</button>
      <button id="soundbtn" class="ghost" aria-label="${isMuted() ? '开启音效' : '关闭音效'}">${isMuted() ? '静音' : '音效'}</button>
      <button id="newbtn" class="ghost" ${online ? 'disabled' : ''}>重开</button>
    </header>
    <main class="table">
      <section class="zone opp${currentActors(state).includes(opp) ? ' turn' : ''}">
        <div class="meta">
          <span class="plate"><b class="pdot"></b>对手 ${flowerChip(opp)}${state.banker === opp ? '<em>庄</em>' : ''}</span>
          <span class="melds">${meldsHTML(opp)}</span>
        </div>
        <div class="backs${dealing ? ' dealing' : ''}">${handHTML(opp, dealing)}</div>
      </section>
      <section class="center" aria-label="共享牌桌">
        <div class="table-status">
          <div class="wall-disc"><b>${state.wall.length}</b><span>牌墙</span></div>
          ${lastDiscard ? tileFaceHTML(lastDiscard, 't-md', 'last') : ''}
          <span class="hint" role="status">${phaseHint()}</span>
        </div>
        <div class="discard-field">
          <div class="discard-side opp-discard"><span class="river-label">对手 · ${state.rivers[opp].length} 张</span><div class="river">${riverHTML(opp)}</div></div>
          <div class="discard-side me-discard"><div class="river">${riverHTML(me)}</div><span class="river-label">你 · ${state.rivers[me].length} 张</span></div>
        </div>
      </section>
      <section class="zone me${currentActors(state).includes(me) ? ' turn' : ''}">
        <div class="meta">
          <span class="plate"><b class="pdot"></b>你 ${flowerChip(me)}${state.banker === me ? '<em>庄</em>' : ''}</span>
          <span class="gang-progress">${state.melds[me].filter((m) => m.type === 'gang').length >= 2 ? '已达两杠 · 可按牌型胡牌' : `${state.melds[me].filter((m) => m.type === 'gang').length} / 2 杠 · 两杠起胡`}</span>
          <span class="melds">${meldsHTML(me)}</span>
        </div>
        <div class="actionbar" role="group" aria-label="对局操作">${abtns || '<span class="action-note">' + (online && !view ? '等待房主开始对局' : state.phase === 'act' && state.turn === me ? '选中后再次点击出牌' : '等待对手操作') + '</span>'}</div>
        <div class="hand-area"><div class="hand${dealing ? ' dealing' : ''}" style="--hand-count:${Math.max(1, state.hands[me].length)}">${handHTML(me, dealing)}</div></div>
      </section>
    </main>
    ${flashMsg ? `<div id="toast">${flashMsg}</div>` : ''}
    ${overlayHTML()}
  `;

  document.getElementById('newbtn')!.onclick = newGame;
  document.getElementById('soundbtn')!.onclick = () => {
    setMuted(!isMuted());
    render();
  };
  document.getElementById('roombtn')!.onclick = () => openModal('room');
  document.getElementById('riverbtn')!.onclick = () => { selection.clear(); openModal('river'); };
  document.getElementById('logbtn')!.onclick = () => openModal('records');
  document.getElementById('resultbtn')?.addEventListener('click', () => openModal('settlement'));
  document.querySelector('[data-modal-close]')?.addEventListener('click', closeModal);
  document.querySelector('[data-modal-backdrop]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-form="room-join"]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    joinFromDialog();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.disabled ||= !!online?.pendingControl;
    button.onclick = () => handleModalAction(button.dataset.action ?? '');
  });
  app.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach((b) => {
    const a = yourActions[Number(b.dataset.idx)];
    if (a) b.onclick = () => doAction(a);
  });
  app.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.discard);
      const discard = selection.choose(selectionContext(), id, legalDiscards());
      if (discard !== null) doAction({ type: 'discard', tileId: discardMap.get(discard)! });
      else {
        render();
        app.querySelector<HTMLButtonElement>(`[data-discard="${id}"]`)?.focus({ preventScroll: true });
      }
    };
  });
  const dialogOpen = modal != null;
  const codeInput = document.getElementById('room-code') as HTMLInputElement | null;
  if (codeInput && codeDraft !== undefined) codeInput.value = codeDraft;
  app.querySelectorAll<HTMLElement>('.discard-side .river').forEach((el) => { el.scrollTop = el.scrollHeight; });
  app.querySelectorAll<HTMLElement>('.topbar,.table').forEach((el) => { el.inert = dialogOpen; });
  if (dialogOpen) {
    const previous = focusedId ? document.getElementById(focusedId) : null;
    const fallback = document.querySelector<HTMLElement>('[data-modal-close]');
    (previous?.closest('.card') ? previous : fallback)?.focus({ preventScroll: true });
    if (focusedId === 'room-code' && codeInput && codeCursor) codeInput.setSelectionRange(codeCursor[0], codeCursor[1]);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    const dialog = document.querySelector('.card');
    const controls = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])');
    if (controls?.length) {
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (!modal) return;
  event.preventDefault();
  closeModal();
});
let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => render());
});

render();
scheduleNext();
