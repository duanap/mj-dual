// 本地双人热座演示：浏览器直接驱动 @mj/engine 纯函数引擎。
// 随机源遵循生产纪律——crypto.getRandomValues + 拒绝采样的 CSPRNG，不用 mulberry32。
import type { Action, GameEvent, GameState, RNG, Seat, Tile, TileCode } from '../src/index';
import { applyAction, availableActions, currentActors, newMatch } from '../src/index';

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
const log: string[] = [];

function tileText(t: Tile): string {
  return `${t.rank}${t.suit === 'tong' ? '筒' : '条'}`;
}
function codeText(c: TileCode): string {
  return `${c.slice(1)}${c.startsWith('T') ? '筒' : '条'}`;
}
const SUIT_TEXT = { tong: '筒', tiao: '条' } as const;

function fmtEvent(e: GameEvent): string {
  switch (e.type) {
    case 'round_started': return `—— 第 ${e.round} 局开始，庄家：座位 ${e.banker} ——`;
    case 'flower_chosen': return `座位 ${e.seat} 定花：${SUIT_TEXT[e.suit]}`;
    case 'exchanged': return `定花交换：庄家花 ${SUIT_TEXT[e.bankerSuit]}，庄家垫 ${e.bankerWild} 张，闲家垫 ${e.otherWild} 张`;
    case 'drawn': return `座位 ${e.seat} 摸牌`;
    case 'discarded': return `座位 ${e.seat} 打出 ${tileText(e.tile)}`;
    case 'peng': return `座位 ${e.seat} 碰 ${tileText(e.tile)}`;
    case 'gang': return `座位 ${e.seat} ${e.kind === 'ming' ? '明杠' : e.kind === 'an' ? '暗杠' : '补杠'} ${tileText(e.tile)}`;
    case 'replacement_drawn': return `座位 ${e.seat} 杠后补牌`;
    case 'hu': return `座位 ${e.seat} ${e.kind === 'zimo' ? '自摸' : '点炮'}胡 ${tileText(e.tile)}！`;
    case 'draw_game': return `流局（${e.reason === 'wall_empty' ? '牌墙已空' : '杠后无牌可补'}）`;
    case 'round_settled': return e.result.winner == null
      ? '本局流局'
      : `本局胡牌：座位 ${e.result.winner}（${e.result.kind === 'zimo' ? '自摸' : '点炮'}）`;
    case 'next_round': return `—— 进入第 ${e.round} 局，庄家：座位 ${e.banker} ——`;
  }
}

let flashText = '';
function flash(msg: string): void {
  flashText = msg;
}

let pendingActions: { seat: Seat; a: Action }[] = [];

function actionLabel(a: Action, seat: Seat): string {
  switch (a.type) {
    case 'choose_flower': return a.suit === 'tong' ? '定花：筒' : '定花：条';
    case 'peng': return '碰';
    case 'hu': return state.phase === 'act' ? '自摸胡！' : '点炮胡！';
    case 'pass': return '过';
    case 'ready': return '就绪（开下一局）';
    case 'gang': {
      if (a.tileId != null) {
        const t = state.hands[seat].find((x) => x.id === a.tileId);
        return `${a.kind === 'an' ? '暗杠' : a.kind === 'bu' ? '补杠' : '明杠'} ${t ? tileText(t) : ''}`;
      }
      return '明杠';
    }
    default: return a.type;
  }
}

function phaseText(): string {
  switch (state.phase) {
    case 'choose_flower': return '等待庄家定花';
    case 'act': return `等待座位 ${state.turn} 操作`;
    case 'respond': return state.pending
      ? `等待座位 ${state.turn} 响应 ${tileText(state.pending.tile)}（座位 ${state.pending.from} 所打）`
      : '等待响应';
    case 'settlement': return '本局结束，等待双方就绪';
  }
}

function panel(seat: Seat): string {
  const isActor = currentActors(state).includes(seat);
  const hand = state.hands[seat];
  const canDiscard = state.phase === 'act' && state.turn === seat;
  const chips = hand
    .map((t) => {
      const cls = `tile ${t.suit}${state.drawnTile?.id === t.id ? ' drawn' : ''}`;
      return canDiscard
        ? `<button class="${cls}" data-discard="${t.id}" title="打出">${tileText(t)}</button>`
        : `<span class="${cls}">${tileText(t)}</span>`;
    })
    .join('');
  const melds = state.melds[seat]
    .map((m) => `<span class="meld">${m.type === 'peng' ? '碰' : m.concealed ? '暗杠' : m.upgraded ? '补杠' : '明杠'} ${codeText(m.code)}</span>`)
    .join('');
  const river = state.rivers[seat].map((t) => `<span class="tile ${t.suit} small">${tileText(t)}</span>`).join('');
  const passes = state.passTiles[seat].map(codeText).join('、');
  return `<section class="player${isActor ? ' active' : ''}">
    <h3>座位 ${seat}${seat === state.banker ? '（庄）' : ''} · 定花：${state.flowers[seat] ? SUIT_TEXT[state.flowers[seat]!] : '—'} · 累计胜 ${state.tally.wins[seat]}${isActor ? ' ←轮到此人' : ''}</h3>
    <div class="row">副露：${melds || '<span class="dim">无</span>'}</div>
    <div class="row">手牌：${chips}</div>
    <div class="row">牌河：${river || '<span class="dim">空</span>'}</div>
    ${passes ? `<div class="row dim">过张：${passes}</div>` : ''}
  </section>`;
}

function render(): void {
  pendingActions = [];
  let actionHtml = '';
  for (const seat of currentActors(state)) {
    for (const a of availableActions(state, seat)) {
      if (a.type === 'discard') continue; // 出牌点手牌 chips
      pendingActions.push({ seat, a });
      actionHtml += `<button class="action" data-idx="${pendingActions.length - 1}">座${seat} · ${actionLabel(a, seat)}</button>`;
    }
  }
  if (!actionHtml) {
    actionHtml = `<span class="dim">${
      state.phase === 'act' ? '无碰/杠/胡机会——点手牌出牌' : '（无待操作）'
    }</span>`;
  }

  let resultHtml = '';
  if (state.result) {
    const r = state.result;
    const desc = r.winner == null
      ? `流局（${r.reason === 'gang_no_replacement' ? '杠后无牌可补' : '牌墙已空'}）`
      : `座位 ${r.winner} 胡（${r.kind === 'zimo' ? '自摸' : '点炮'}${r.tile ? `，胡 ${tileText(r.tile)}` : ''}）`;
    resultHtml = `<div id="result">本局结果：${desc} · 战绩：座0 胜 ${state.tally.wins[0]} / 座1 胜 ${state.tally.wins[1]} / 流局 ${state.tally.draws}</div>`;
  }

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <h1>两人两杠起胡麻将 · 引擎热座演示</h1>
    <p class="sub">本地演示页，直接调用 packages/engine 纯函数引擎（真实规则校验）。热座模式下两手皆可见；联机服务端属阶段二，尚未实现。</p>
    <header>
      <span class="badge">第 ${state.round} 局</span>
      <span class="badge">${phaseText()}</span>
      <span class="badge">庄家：座位 ${state.banker}</span>
      <span class="badge">牌墙：${state.wall.length} 张</span>
      <span class="badge">seq ${state.seq}</span>
      <button id="new">新对局</button>
    </header>
    ${resultHtml}
    <div class="players">${panel(0)}${panel(1)}</div>
    <div id="actions">${actionHtml}</div>
    <div id="log">${log.map((l) => `<div>${l}</div>`).join('')}</div>
    <div id="flash">${flashText}</div>
  `;

  document.getElementById('new')!.onclick = () => {
    state = newMatch(rng);
    log.length = 0;
    flash('');
    render();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach((b) => {
    b.onclick = () => act(pendingActions[Number(b.dataset.idx)]!.a);
  });
  app.querySelectorAll<HTMLButtonElement>('[data-discard]').forEach((b) => {
    b.onclick = () => act({ type: 'discard', tileId: Number(b.dataset.discard) });
  });
}

function act(a: Action): void {
  try {
    const res = applyAction(state, a, rng);
    state = res.state;
    log.unshift(...res.events.map(fmtEvent));
    if (log.length > 80) log.length = 80;
    flash('');
  } catch (err) {
    flash(err instanceof Error ? err.message : String(err));
  }
  render();
}

render();
