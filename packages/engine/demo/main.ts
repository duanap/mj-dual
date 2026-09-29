// 两人两杠起胡麻将 · 人机对战（本地） + 联机对战（@mj/server）
// 规则全部由 packages/engine 纯函数引擎校验。联机遵循架构文档：客户端只发意图，
// 座位由服务端分配，状态由服务端按玩家视角过滤后下发（PlayerView）。
import { io, type Socket } from 'socket.io-client';
import type { Action, GameEvent, GameState, PlayerView, RNG, Seat, Tile } from '../src/index';
import { applyAction, availableActions, currentActors, newMatch, suggestAction } from '../src/index';
import { backHTML, tileFaceHTML, tileText } from './tiles';
import { isMuted, setMuted, sfx } from './audio';

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
let flashMsg = '';
let menuOpen = false; // 联机菜单（暂停本地对局）
let yourActions: Action[] = [];

interface Online {
  socket: Socket;
  code: string;
  token: string;
}
let online: Online | null = null;
let view: PlayerView | null = null;

const SUIT_TEXT = { tong: '筒', tiao: '条' } as const;
const seatName = (s: Seat): string => (s === me ? '你' : '对手');
const flowerChip = (s: Seat): string => {
  const f = state.flowers[s];
  return f ? `<i class="fchip ${f}">${SUIT_TEXT[f]}</i>` : '<i class="fchip none">?</i>';
};

/* ---------------- 模式：本地 AI / 联机 ---------------- */

function goLocal(): void {
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

function viewToState(v: PlayerView): GameState {
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
    ready: v.ready,
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

function onState(v: PlayerView): void {
  view = v;
  me = v.you;
  opp = (1 - v.you) as Seat;
  consumeEvents(v.events);
  state = viewToState(v);
  render();
}

function connectOnline(): Socket {
  const socket = io({ reconnectionAttempts: 5, transports: ['websocket', 'polling'] });
  socket.on('state', onState);
  socket.on('room:peer', (p: { seat: Seat; connected: boolean }) => {
    flash(p.connected ? '对手已上线' : '对手掉线，自动托管中');
    render();
  });
  socket.on('room:kicked', () => {
    flash('对局已在其他页面打开，本页返回人机模式');
    goLocal();
  });
  socket.on('disconnect', () => {
    if (online) {
      flash('连接断开，正在重连…');
      render();
    }
  });
  socket.on('connect_error', () => {
    if (!online && !menuOpen) {
      flash('联机服务不可用（请确认服务端已启动：npm run server）');
      render();
    }
  });
  return socket;
}

function applyJoined(socket: Socket, res: any): void {
  if (res.error) {
    sessionStorage.removeItem('mj-room');
    flash(`加入失败：${res.error}`);
    menuOpen = true;
    render();
    return;
  }
  menuOpen = false;
  gen++; // 停掉本地 AI
  online = { socket, code: res.code, token: res.token };
  sessionStorage.setItem('mj-room', JSON.stringify({ code: res.code, token: res.token }));
  onState(res.view);
}

function createRoom(): void {
  const socket = connectOnline();
  flash('正在创建房间…');
  render();
  socket.once('connect', () => {
    socket.emit('room:create', (res: any) => applyJoined(socket, res));
  });
}

function joinRoom(code: string): void {
  const socket = connectOnline();
  flash('正在加入房间…');
  render();
  socket.once('connect', () => {
    socket.emit('room:join', { code }, (res: any) => applyJoined(socket, res));
  });
}

function rejoin(code: string, token: string): void {
  const socket = connectOnline();
  socket.once('connect', () => {
    socket.emit('room:rejoin', { code, token }, (res: any) => applyJoined(socket, res));
  });
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
  if (online) {
    online.socket.emit('action', a, (res: any) => {
      if (res && res.ok === false) flash(res.message ?? '操作被拒绝');
    });
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
  if (online || menuOpen) return; // 联机由服务端驱动；菜单打开时暂停本地对局
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
      if (myGen !== gen || menuOpen) return;
      applyLocal(suggestAction(state, opp, rng));
    }, state.phase === 'respond' ? 950 : 720);
  }
}

function newGame(): void {
  if (online) return;
  gen++;
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
  const hand = state.hands[seat];
  if (seat === opp) {
    const reveal = state.phase === 'settlement';
    return hand.map((t) => (reveal && t.id > 0 ? tileFaceHTML(t, 't-sm') : backHTML('t-sm'))).join('');
  }
  const canPlay = state.phase === 'act' && state.turn === me && yourActions.some((a) => a.type === 'discard');
  return hand
    .map((t, i) => {
      const cls = 't-lg' + (state.drawnTile?.id === t.id ? ' drawn' : '');
      const delay = dealing ? ` style="animation-delay:${i * 35}ms"` : '';
      return canPlay && t.id > 0
        ? `<button class="tbtn"${delay} data-discard="${t.id}" title="打出">${tileFaceHTML(t, cls)}</button>`
        : `<span class="twrap"${delay}>${tileFaceHTML(t, cls)}</span>`;
    })
    .join('');
}

function meldsHTML(seat: Seat): string {
  return state.melds[seat]
    .map((m) => {
      const label = m.type === 'peng' ? '碰' : m.concealed ? '暗杠' : m.upgraded ? '补杠' : '明杠';
      const hide = seat === opp && m.concealed; // 暗杠对对手保密
      const tiles = m.tiles.map((t) => (hide || t.id < 0 ? backHTML('t-xs') : tileFaceHTML(t, 't-xs'))).join('');
      return `<span class="meld">${tiles}<i>${label}</i></span>`;
    })
    .join('');
}

function riverHTML(seat: Seat): string {
  const r = state.rivers[seat];
  return r.map((t, i) => tileFaceHTML(t, 't-sm', i === r.length - 1 ? 'latest' : '')).join('');
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
  switch (state.phase) {
    case 'choose_flower': return state.turn === me ? '请选择你的花色（定花）' : '对手正在定花…';
    case 'act': return state.turn === me ? '轮到你 —— 点手牌出牌' : '对手思考中…';
    case 'respond': {
      const t = state.pending ? tileText(state.pending.tile) : '';
      return state.turn === me ? `对手打出 ${t}，吃不住就点「过」` : `你打出 ${t}，对手响应中…`;
    }
    case 'settlement': return '本局结束';
  }
}

function overlayHTML(): string {
  if (menuOpen) {
    return `<div class="overlay"><div class="card">
      <h2>联机对战</h2>
      <p class="dim">与另一名玩家同池对战（需要服务端在线）</p>
      <button id="mkroom" class="abtn peng">创建房间</button>
      <div class="joinrow">
        <input id="joincode" maxlength="4" placeholder="房间号" autocomplete="off">
        <button id="doroom" class="abtn choose_flower">加入</button>
      </div>
      <button id="closemenu" class="ghost" style="margin-top:14px">取消，继续人机对战</button>
    </div></div>`;
  }
  if (state.phase !== 'settlement' || !state.result) return '';
  const r = state.result;
  const title = r.winner == null ? '流 局' : `${r.winner === me ? '🎉' : '💦'} ${seatName(r.winner)}胡了！`;
  const sub = r.winner == null
    ? r.reason === 'gang_no_replacement' ? '杠后无牌可补' : '牌墙已摸空'
    : `${r.kind === 'zimo' ? '自摸' : '点炮'}胡 · 胡牌张 ${r.tile ? tileText(r.tile) : ''}`;
  const hands = ([me, opp] as Seat[])
    .map((s) => `<div class="rev"><b>${seatName(s)}${flowerChip(s)}</b>${state.hands[s].filter((t) => t.id > 0).map((t) => tileFaceHTML(t, 't-xs')).join('')}</div>`)
    .join('');
  const waiting = state.ready[me] && !state.ready[opp];
  const next = waiting
    ? '<p class="tally">等待对手就绪…</p>'
    : '<button id="next" class="abtn hu">下一局</button>';
  return `<div class="overlay"><div class="card">
    <h2>${title}</h2>
    <p>${sub}</p>
    ${hands}
    <p class="tally">战绩 —— 你 <b>${state.tally.wins[me]}</b> 胜 · 对手 <b>${state.tally.wins[opp]}</b> 胜 · 流局 ${state.tally.draws}</p>
    ${next}
  </div></div>`;
}

function render(): void {
  yourActions = online && view ? view.yourActions : availableActions(state, me);
  let abtns = '';
  if (state.phase !== 'settlement') {
    for (const a of yourActions) {
      if (a.type === 'discard') continue;
      abtns += `<button class="abtn ${a.type}" data-idx="${yourActions.indexOf(a)}">${actionLabel(a, me)}</button>`;
    }
  }

  const dealing = state.round !== lastRound;
  lastRound = state.round;

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="topbar">
      <span class="stat">第 ${state.round} 局</span>
      <span class="stat">庄 ${seatName(state.banker)}</span>
      <span class="stat score">${state.tally.wins[me]}胜${state.tally.wins[opp]}负${state.tally.draws}流</span>
      ${online ? `<span class="stat online">房间 <b>${online.code}</b></span>` : ''}
      <span class="spacer"></span>
      ${online
        ? '<button id="leavebtn" class="ghost">退出房间</button>'
        : '<button id="onlinebtn" class="ghost">联机</button>'}
      <button id="logbtn" class="ghost" title="对局记录">☰</button>
      <button id="soundbtn" class="ghost" title="音效">${isMuted() ? '🔇' : '🔊'}</button>
      <button id="newbtn" class="ghost" title="新对局" ${online ? 'disabled' : ''}>↻</button>
    </header>
    <main class="table">
      <section class="zone opp${currentActors(state).includes(opp) ? ' turn' : ''}">
        <div class="meta">
          <span class="plate"><b class="pdot"></b>对手 ${flowerChip(opp)}${state.banker === opp ? '<em>庄</em>' : ''}</span>
          <span class="melds">${meldsHTML(opp)}</span>
        </div>
        <div class="tray"><div class="river">${riverHTML(opp)}</div></div>
        <div class="backs">${handHTML(opp, false)}</div>
      </section>
      <section class="center">
        <div class="wall-disc"><b>${state.wall.length}</b><span>牌墙</span></div>
        <div class="mid">
          <span class="hint">${phaseHint()}</span>
          ${lastDiscard ? tileFaceHTML(lastDiscard, 't-md', 'last') : ''}
        </div>
      </section>
      <section class="zone me${currentActors(state).includes(me) ? ' turn' : ''}">
        <div class="tray"><div class="river">${riverHTML(me)}</div></div>
        <div class="meta">
          <span class="plate"><b class="pdot"></b>你 ${flowerChip(me)}${state.banker === me ? '<em>庄</em>' : ''}</span>
          <span class="melds">${meldsHTML(me)}</span>
        </div>
        <div class="hand${dealing ? ' dealing' : ''}">${handHTML(me, dealing)}</div>
      </section>
    </main>
    <footer class="actionbar">${abtns}</footer>
    <aside id="logpanel" class="hidden">${history.map((h) => `<div>${h}</div>`).join('')}</aside>
    ${flashMsg ? `<div id="toast">${flashMsg}</div>` : ''}
    ${overlayHTML()}
  `;

  document.getElementById('newbtn')!.onclick = newGame;
  document.getElementById('soundbtn')!.onclick = () => {
    setMuted(!isMuted());
    render();
  };
  document.getElementById('logbtn')!.onclick = () => document.getElementById('logpanel')!.classList.toggle('hidden');
  document.getElementById('onlinebtn')?.addEventListener('click', () => {
    menuOpen = true;
    render();
  });
  document.getElementById('leavebtn')?.addEventListener('click', goLocal);
  document.getElementById('closemenu')?.addEventListener('click', () => {
    menuOpen = false;
    render();
    scheduleNext();
  });
  document.getElementById('mkroom')?.addEventListener('click', () => createRoom());
  document.getElementById('doroom')?.addEventListener('click', () => {
    const v = (document.getElementById('joincode') as HTMLInputElement).value.trim().toUpperCase();
    if (v.length === 4) joinRoom(v);
  });
  document.getElementById('next')?.addEventListener('click', () => doAction({ type: 'ready', seat: me }));
  app.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach((b) => {
    const a = yourActions[Number(b.dataset.idx)];
    if (a) b.onclick = () => doAction(a);
  });
  app.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) => {
    b.onclick = () => doAction({ type: 'discard', tileId: Number(b.dataset.discard) });
  });
}

render();
scheduleNext();
