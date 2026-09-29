import type { GameState } from './types';
import { TOTAL_TILES, type Tile } from './tile';

/**
 * 开发期状态断言（架构文档八）：
 * - 72 张守恒：手牌 + 牌墙 + 牌河 + melds = 72（melds 单一来源，碰按 3 张、杠按 4 张计）
 * - 全场牌 id 唯一
 * - 阶段手牌不变量：手牌数 + 3×面子数，act=14、respond=双方 13、结算赢家 14
 */
export function checkState(state: GameState): string[] {
  const issues: string[] = [];
  const seen = new Set<number>();
  let total = 0;

  const add = (tiles: readonly Tile[], where: string) => {
    for (const t of tiles) {
      total++;
      if (seen.has(t.id)) issues.push(`重复牌 id=${t.id}（${where}）`);
      seen.add(t.id);
    }
  };
  add(state.hands[0], 'hand0');
  add(state.hands[1], 'hand1');
  add(state.wall, 'wall');
  add(state.rivers[0], 'river0');
  add(state.rivers[1], 'river1');
  for (const seat of [0, 1] as const) {
    state.melds[seat].forEach((m, i) => {
      if (m.tiles.length !== (m.type === 'peng' ? 3 : 4)) {
        issues.push(`melds[${seat}][${i}] 张数 ${m.tiles.length} 与类型 ${m.type} 不符`);
      }
      add(m.tiles, `meld${seat}-${i}`);
    });
  }
  if (total !== TOTAL_TILES) issues.push(`总张数 ${total} ≠ ${TOTAL_TILES}`);

  const eq = (seat: 0 | 1) => state.hands[seat].length + 3 * state.melds[seat].length;
  const expect = (cond: boolean, msg: string) => {
    if (!cond) issues.push(msg);
  };
  if (state.phase === 'respond') {
    expect(state.pending !== null, 'respond 阶段 pending 不能为空');
    const discarder = state.pending ? state.pending.from : ((1 - state.turn) as 0 | 1);
    expect(eq(discarder) === 13, `respond 阶段弃牌方手牌等价 ${eq(discarder)} ≠ 13`);
    expect(eq(state.turn) === 13, `respond 阶段响应方手牌等价 ${eq(state.turn)} ≠ 13`);
  } else if (state.phase === 'act') {
    expect(eq(state.turn) === 14, `act 阶段当前玩家手牌等价 ${eq(state.turn)} ≠ 14`);
    expect(eq((1 - state.turn) as 0 | 1) === 13, `act 阶段对手手牌等价 ≠ 13`);
  } else if (state.phase === 'settlement' && state.result?.winner != null) {
    const w = state.result.winner;
    expect(eq(w) === 14, `结算赢家手牌等价 ${eq(w)} ≠ 14`);
    expect(eq((1 - w) as 0 | 1) === 13, `结算输家手牌等价 ≠ 13`);
  } else if (state.phase === 'settlement') {
    for (const seat of [0, 1] as const) expect(eq(seat) === 13, `流局结算 seat${seat} 手牌等价 ≠ 13`);
  } else if (state.phase === 'choose_flower') {
    const b = state.banker;
    expect(
      state.hands[b].length === 14 && state.hands[(1 - b) as 0 | 1].length === 13,
      '定花前应庄14/闲13',
    );
  }

  void seen;
  return issues;
}

export function assertState(state: GameState): void {
  const issues = checkState(state);
  if (issues.length > 0) {
    throw new Error(`状态校验失败：${issues.join('；')}`);
  }
}
