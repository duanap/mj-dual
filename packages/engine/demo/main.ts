// 两人两杠起胡麻将 · 人机对战（本地单机版）
// 视角：你=座位0（只看得到自己的牌），AI=座位1；规则全部由 packages/engine 纯函数引擎校验。
import type { Action, GameEvent, GameState, RNG, Seat, Tile } from '../src/index';
import { applyAction, availableActions, currentActors, newMatch } from '../src/index';
import { aiChooseAction } from './ai';
import { backHTML, tileFaceHTML, tileText } from './tiles';
import { isMuted, setMuted, sfx } from './audio';

const HUMAN: Seat = 0;
const AI: Seat = 1;

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
let gen = 0; // 新对局代数：作废尚未触发的 AI 定时器
let history: string[] = [];
let lastDiscard: Tile | null = null;
let pendingActions: { seat: Seat; a: Action }[] = [];

const SUIT_TEXT = { tong: '筒', tiao: '条' } as const;
const seatName = (s: Seat): string => (s === HUMAN ? '你' : '对手');
const flowerText = (s: Seat): string => (state.flowers[s] ? SUIT_TEXT[state.flowers[s]!] : '—');

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

function apply(a: Action): void {
  try {
    const res = applyAction(state, a, rng);
    state = res.state;
    for (const e of res.events) {
      history.unshift(fmtEvent(e));
      sfxFor(e);
    }
    if (history.length > 120) history.length = 120;
  } catch (err) {
    console.error('非法操作（不应发生）', err);
  }
  render();
  scheduleNext();
}

function scheduleNext(): void {
  const myGen = gen;
  if (state.phase === 'settlement') {
    if (currentActors(state).includes(AI)) {
      setTimeout(() => {
        if (myGen === gen && state.phase === 'settlement') apply({ type: 'ready', seat: AI });
      }, 1100);
    }
    return;
  }
  if (currentActors(state).includes(AI)) {
    setTimeout(() => {
      if (myGen !== gen) return;
      apply(aiChooseAction(state, AI, rng));
    }, state.phase === 'respond' ? 950 : 720);
  }
}

function newGame(): void {
  gen++;
  state = newMatch(rng);
  history = [];
  lastDiscard = null;
  render();
  scheduleNext();
}

/* ---------------- 渲染 ---------------- */

function handHTML(seat: Seat): string {
  const hand = state.hands[seat];
  if (seat === AI) {
    const reveal = state.phase === 'settlement';
    return hand.map((t) => (reveal ? tileFaceHTML(t, 't-sm') : backHTML('t-sm'))).join('');
  }
  const canPlay = state.phase === 'act' && state.turn === HUMAN;
  return hand
    .map((t) => {
      const cls = 't-lg' + (state.drawnTile?.id === t.id ? ' drawn' : '');
      return canPlay
        ? `<button class="tbtn" data-discard="${t.id}" title="打出">${tileFaceHTML(t, cls)}</button>`
        : tileFaceHTML(t, cls);
    })
    .join('');
}

function meldsHTML(seat: Seat): string {
  return state.melds[seat]
    .map((m) => {
      const label = m.type === 'peng' ? '碰' : m.concealed ? '暗杠' : m.upgraded ? '补杠' : '明杠';
      const hide = seat === AI && m.concealed; // 暗杠对对手保密
      const tiles = m.tiles.map((t) => (hide ? backHTML('t-xs') : tileFaceHTML(t, 't-xs'))).join('');
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
    case 'choose_flower': return state.turn === HUMAN ? '请选择你的花色（定花）' : '对手正在定花…';
    case 'act': return state.turn === HUMAN ? '轮到你 —— 点手牌出牌' : '对手思考中…';
    case 'respond': {
      const t = state.pending ? tileText(state.pending.tile) : '';
      return state.turn === HUMAN ? `对手打出 ${t}，吃不住就点「过」` : `你打出 ${t}，对手响应中…`;
    }
    case 'settlement': return '本局结束';
  }
}

function overlayHTML(): string {
  if (state.phase !== 'settlement' || !state.result) return '';
  const r = state.result;
  const title = r.winner == null ? '流 局' : `${seatName(r.winner)}胡了！`;
  const sub = r.winner == null
    ? r.reason === 'gang_no_replacement' ? '杠后无牌可补' : '牌墙已摸空'
    : `${r.kind === 'zimo' ? '自摸' : '点炮'}胡 · 胡牌张 ${r.tile ? tileText(r.tile) : ''}`;
  const hands = ([HUMAN, AI] as Seat[])
    .map(
      (s) =>
        `<div class="rev"><b>${seatName(s)}（${flowerText(s)}）</b>${state.hands[s].map((t) => tileFaceHTML(t, 't-xs')).join('')}</div>`,
    )
    .join('');
  return `<div class="overlay"><div class="card">
    <h2>${title}</h2>
    <p>${sub}</p>
    ${hands}
    <p class="tally">战绩 —— 你 ${state.tally.wins[HUMAN]} 胜 · 对手 ${state.tally.wins[AI]} 胜 · 流局 ${state.tally.draws}</p>
    <button id="next" class="abtn hu">下一局</button>
  </div></div>`;
}

function render(): void {
  pendingActions = [];
  let abtns = '';
  if (state.phase !== 'settlement' && currentActors(state).includes(HUMAN)) {
    for (const a of availableActions(state, HUMAN)) {
      if (a.type === 'discard') continue;
      pendingActions.push({ seat: HUMAN, a });
      abtns += `<button class="abtn ${a.type}" data-idx="${pendingActions.length - 1}">${actionLabel(a, HUMAN)}</button>`;
    }
  }

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="topbar">
      <span class="stat">第 ${state.round} 局</span>
      <span class="stat">庄：${seatName(state.banker)}</span>
      <span class="stat">牌墙 ${state.wall.length}</span>
      <span class="stat">${state.tally.wins[HUMAN]}胜 ${state.tally.wins[AI]}负 ${state.tally.draws}流</span>
      <span class="spacer"></span>
      <button id="logbtn" class="ghost">记录</button>
      <button id="soundbtn" class="ghost">${isMuted() ? '🔇' : '🔊'}</button>
      <button id="newbtn" class="ghost">新对局</button>
    </header>
    <main class="table">
      <section class="zone opp${currentActors(state).includes(AI) ? ' turn' : ''}">
        <div class="meta">
          <span class="plate">对手（${flowerText(AI)}）${state.banker === AI ? ' · 庄' : ''}</span>
          <span class="melds">${meldsHTML(AI)}</span>
        </div>
        <div class="river">${riverHTML(AI)}</div>
        <div class="backs">${handHTML(AI)}</div>
      </section>
      <section class="center">
        <span class="hint">${phaseHint()}</span>
        ${lastDiscard ? tileFaceHTML(lastDiscard, 't-md', 'last') : ''}
      </section>
      <section class="zone me${currentActors(state).includes(HUMAN) ? ' turn' : ''}">
        <div class="river">${riverHTML(HUMAN)}</div>
        <div class="meta">
          <span class="plate">你（${flowerText(HUMAN)}）${state.banker === HUMAN ? ' · 庄' : ''}</span>
          <span class="melds">${meldsHTML(HUMAN)}</span>
        </div>
        <div class="hand">${handHTML(HUMAN)}</div>
      </section>
    </main>
    <footer class="actionbar">${abtns}</footer>
    <aside id="logpanel" class="hidden">${history.map((h) => `<div>${h}</div>`).join('')}</aside>
    ${overlayHTML()}
  `;

  document.getElementById('newbtn')!.onclick = newGame;
  document.getElementById('soundbtn')!.onclick = () => {
    setMuted(!isMuted());
    render();
  };
  document.getElementById('logbtn')!.onclick = () => document.getElementById('logpanel')!.classList.toggle('hidden');
  document.getElementById('next')?.addEventListener('click', () => apply({ type: 'ready', seat: HUMAN }));
  app.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach((b) => {
    b.onclick = () => apply(pendingActions[Number(b.dataset.idx)]!.a);
  });
  app.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) => {
    b.onclick = () => apply({ type: 'discard', tileId: Number(b.dataset.discard) });
  });
}

render();
scheduleNext();
