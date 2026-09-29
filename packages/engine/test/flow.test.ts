import { describe, expect, it } from 'vitest';
import { RuleError, applyAction, availableActions, createMatchForTest, newMatch } from '../src/engine';
import { checkState } from '../src/validator';
import { claimsOn } from '../src/claims';
import { mulberry32 } from '../src/rng';
import { codeOf } from '../src/tile';
import type { Action, GameState, Meld } from '../src/types';
import { hand, handsTuple, takeOne } from './helpers';

const rng = mulberry32(20260929);

function ok(s: GameState): void {
  const issues = checkState(s);
  expect(issues, issues.join('；')).toEqual([]);
}

function expectRuleError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`应当抛出 ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(RuleError);
    expect((e as RuleError).code).toBe(code);
  }
}

const byCode = (s: GameState, seat: 0 | 1, code: string) => s.hands[seat].find((t) => codeOf(t) === code)!.id;

/** 纯筒/纯条对局底座：定花后进入 act 阶段（交换情况A，无废牌） */
function baseMatch(bankerSpec: string, otherSpec: string): GameState {
  return createMatchForTest({ hands: handsTuple(bankerSpec, otherSpec), flower: 'tong' });
}

const PURE_OTHER = 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B9 B8 B8 B7';

describe('定花与开局（规则三/四/六）', () => {
  it('定花后庄家先出牌；无响应时自动轮到闲家摸牌', () => {
    const s = baseMatch('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7', PURE_OTHER);
    expect(s.phase).toBe('act');
    expect(s.turn).toBe(0);
    expect(s.flowers).toEqual(['tong', 'tiao']);
    expect(s.hands[0].length).toBe(14);
    expect(s.wall.length).toBe(45);
    ok(s);

    const { state: s2, events } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'T7') }, rng);
    ok(s2);
    expect(events.map((e) => e.type)).toEqual(['discarded', 'drawn']);
    expect(s2.phase).toBe('act');
    expect(s2.turn).toBe(1);
    expect(s2.hands[0].length).toBe(13);
    expect(s2.rivers[0].length).toBe(1);
    expect(s2.wall.length).toBe(44);
    expect(s2.hands[1].length).toBe(14); // 摸牌后
  });

  it('首局庄家由种子决定且可复现', () => {
    const a = newMatch(123);
    const b = newMatch(123);
    expect(a.banker).toBe(b.banker);
    expect(a.hands[0].map((t) => t.id)).toEqual(b.hands[0].map((t) => t.id));
    const bankers = new Set(Array.from({ length: 30 }, (_, i) => newMatch(i + 1).banker));
    expect([...bankers].sort()).toEqual([0, 1]);
  });
});

describe('碰（规则七/十三）', () => {
  it('碰后计入面子、不计杠数，碰后只能出牌', () => {
    // 庄家 13 筒；交换后庄家的异花废牌 = 闲家垫的 B8（闲家手牌首张）；闲家另留 2 张 B8
    const s = baseMatch(
      'T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T9 T9 T8 B3',
      'B8 B9 B9 B9 B9 B1 B2 B3 B4 B5 B6 B8 B8',
    );
    ok(s);
    const { state: s2 } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'B8') }, rng);
    ok(s2);
    expect(s2.phase).toBe('respond');
    expect(s2.turn).toBe(1);
    expect(availableActions(s2, 1).map((a) => a.type)).toEqual(['peng', 'pass']);

    const { state: s3 } = applyAction(s2, { type: 'peng' }, rng);
    ok(s3);
    expect(s3.melds[1].length).toBe(1);
    expect(s3.melds[1]![0]!.type).toBe('peng');
    expect(s3.phase).toBe('act');
    expect(s3.claimable).toBe(false);
    const acts = availableActions(s3, 1);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.type === 'discard')).toBe(true);

    const { state: s4 } = applyAction(s3, { type: 'discard', tileId: byCode(s3, 1, 'B1') }, rng);
    ok(s4);
    expect(s4.turn).toBe(0); // 庄家对条子无响应，直接摸牌
    expect(s4.hands[0].length).toBe(14);
  });
});

describe('杠（规则七/八/九）', () => {
  it('明杠 → 杠后补牌 → 连暗杠', () => {
    // 庄家 13 筒；交换后庄家的异花废牌 = 闲家垫的 B7（闲家手牌首张）；闲家另留 3 张 B7 + 4 张 B9
    const s = baseMatch(
      'T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T9 T9 T8 B2',
      'B7 B9 B9 B9 B9 B1 B2 B3 B4 B5 B7 B7 B7',
    );
    ok(s);
    expect(s.hands[0].some((t) => codeOf(t) === 'B7')).toBe(true);
    const { state: s2 } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'B7') }, rng);
    expect(s2.phase).toBe('respond');
    const acts = availableActions(s2, 1);
    expect(acts.map((a) => a.type)).toEqual(['gang', 'peng', 'pass']);

    const { state: s3 } = applyAction(s2, { type: 'gang' }, rng); // 明杠
    ok(s3);
    expect(s3.melds[1].length).toBe(1);
    expect(s3.melds[1]![0]!.type).toBe('gang');
    expect(s3.melds[1]![0]!.concealed).toBe(false);
    expect(s3.wall.length).toBe(44); // 杠后补了 1 张
    expect(s3.claimable).toBe(true);

    // 手里 4 张 B9 → 连暗杠
    const an = availableActions(s3, 1).find((a): a is Extract<Action, { type: 'gang' }> => a.type === 'gang');
    expect(an?.kind).toBe('an');
    const { state: s4 } = applyAction(s3, an!, rng);
    ok(s4);
    expect(s4.melds[1].length).toBe(2);
    expect(s4.melds[1]![1]!.concealed).toBe(true);
    expect(s4.wall.length).toBe(43);

    const { state: s5 } = applyAction(s4, { type: 'discard', tileId: byCode(s4, 1, 'B1') }, rng);
    ok(s5);
    expect(s5.turn).toBe(0);
    expect(s5.wall.length).toBe(42);
  });

  it('补杠：碰升级为杠并立即计入杠数量（规则十三）', () => {
    const s = baseMatch('T1 T2 T3 T4 T8 T8 T8 T8 T9 T9 T9 T9 T5 T6', 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B1 B2 B3 B4');
    // 手工构造：3 张 T9 进碰，剩 1 张 T9 当作刚摸的牌
    const work: GameState = structuredClone(s);
    const nines = work.hands[0].filter((t) => t.rank === 9);
    expect(nines.length).toBe(4);
    for (let i = 0; i < 3; i++) {
      work.hands[0].splice(work.hands[0].findIndex((t) => t.id === nines[i]!.id), 1);
    }
    const meld: Meld = { type: 'peng', code: 'T9', tiles: nines.slice(0, 3), concealed: false, upgraded: false };
    work.melds[0].push(meld);
    work.drawnTile = nines[3]!;
    work.claimable = true;
    ok(work);

    // 同一时刻 T8 可暗杠、T9 可补杠 → 必须指定目标
    expectRuleError(() => applyAction(work, { type: 'gang' }, rng), 'AMBIGUOUS_GANG');

    const { state: s2 } = applyAction(work, { type: 'gang', tileId: nines[3]!.id, kind: 'bu' }, rng);
    ok(s2);
    const bu = s2.melds[0]![0]!;
    expect(bu.type).toBe('gang');
    expect(bu.tiles.length).toBe(4);
    expect(bu.upgraded).toBe(true);
    expect(s2.wall.length).toBe(44);

    // 补杠后 T8 仍可暗杠（连杠）
    const an = availableActions(s2, 0).find((a): a is Extract<Action, { type: 'gang' }> => a.type === 'gang');
    expect(an?.kind).toBe('an');
    const { state: s3 } = applyAction(s2, an!, rng);
    ok(s3);
    expect(s3.melds[0].length).toBe(2);
  });

  it('只允许杠本家花色（规则九）', () => {
    const s = baseMatch('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7', PURE_OTHER);
    // 庄家手里没有条子，直接对筒牌宣暗杠缺少4张 → INVALID_GANG
    expectRuleError(() => applyAction(s, { type: 'gang', tileId: byCode(s, 0, 'T1'), kind: 'an' }, rng), 'INVALID_GANG');
  });
});

describe('流局（规则八/十四）', () => {
  function drainWall(s: GameState): void {
    s.rivers[0].push(...s.wall);
    s.wall = [];
  }

  it('牌墙摸完无人胡 → 流局连庄', () => {
    const s = baseMatch('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7', PURE_OTHER);
    drainWall(s);
    ok(s);
    const { state: s2 } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'T1') }, rng);
    expect(s2.phase).toBe('settlement');
    expect(s2.result).toEqual({ winner: null, kind: 'draw', reason: 'wall_empty' });
    expect(s2.tally.draws).toBe(1);

    const { state: s3 } = applyAction(s2, { type: 'ready', seat: 0 }, rng);
    const { state: s4, events } = applyAction(s3, { type: 'ready', seat: 1 }, rng);
    ok(s4);
    expect(s4.round).toBe(2);
    expect(s4.banker).toBe(0); // 流局庄家继续坐庄
    expect(s4.phase).toBe('choose_flower');
    expect(s4.wall.length).toBe(45);
    expect(events.some((e) => e.type === 'next_round')).toBe(true);
  });

  it('杠后需要补牌时牌墙为空 → 流局', () => {
    const s = baseMatch(
      'T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T9 T9 T8 B2',
      'B7 B9 B9 B9 B9 B1 B2 B3 B4 B5 B7 B7 B7',
    );
    const { state: s2 } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'B7') }, rng);
    expect(s2.phase).toBe('respond');
    // 墙塞进响应方牌河（不能动弃牌方牌河：其末张 = 待响应牌）
    s2.rivers[1].push(...s2.wall);
    s2.wall = [];
    ok(s2);
    const { state: s3 } = applyAction(s2, { type: 'gang' }, rng);
    expect(s3.phase).toBe('settlement');
    expect(s3.result).toEqual({ winner: null, kind: 'draw', reason: 'gang_no_replacement' });
    expect(s3.melds[1].length).toBe(1); // 杠仍成立
    expect(s3.tally.draws).toBe(1);
  });
});

describe('胡牌确认（规则十一/十二）', () => {
  /**
   * 闲家 2 暗杠、手牌 B1B2B3B4B5B6B5 听 5条；
   * 庄家的异花废牌来自交换垫牌（闲家手牌首张 B5），打出 → 点炮局面。
   */
  function respondState(): GameState {
    const s = createMatchForTest({
      hands: handsTuple(
        'T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T9 T9 T8 B5', // 庄家 13筒；他的 B5 交换后归闲家
        'B5 B1 B2 B3 B4 B6 B5 B7 B7 B7 B8 B8 B8', // 闲家首张 B5 恰好被垫给庄家作废牌
      ),
      flower: 'tong',
    });
    // 交换（情况B）：庄家 13筒 + 闲家垫的 B5；闲家 12 条 + 庄家的 B5 = 13 条
    expect(s.hands[0].some((t) => codeOf(t) === 'B5')).toBe(true);
    // 闲家：B7、B8 各凑第 4 张成暗杠（第 4 张从牌墙取）
    for (const code of ['B7', 'B8']) {
      const inHand = s.hands[1].filter((t) => codeOf(t) === code);
      for (const t of inHand) s.hands[1].splice(s.hands[1].findIndex((x) => x.id === t.id), 1);
      const tiles = [...inHand];
      while (tiles.length < 4) tiles.push(takeOne(s.wall, (t) => codeOf(t) === code));
      s.melds[1].push({ type: 'gang', code, tiles, concealed: true, upgraded: false });
    }
    // 闲家手牌 B1 B2 B3 B4 B6 B5 B5，听 5条（123+456+55）
    ok(s);
    const { state: s2 } = applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'B5') }, rng);
    expect(s2.phase).toBe('respond');
    return s2;
  }

  it('点炮胡：手动确认后结算，赢家下一局坐庄（规则二）', () => {
    const s2 = respondState();
    // 手里有 B5×2 → 既能胡也能碰
    expect(availableActions(s2, 1).map((a) => a.type)).toEqual(['hu', 'peng', 'pass']);
    const tile = s2.pending!.tile;
    const { state: s3 } = applyAction(s2, { type: 'hu' }, rng);
    ok(s3);
    expect(s3.result).toMatchObject({ winner: 1, kind: 'dianpao' });
    expect(s3.result!.tile!.id).toBe(tile.id);
    expect(s3.tally.wins).toEqual([0, 1]);
    expect(s3.rivers[0].length).toBe(0); // 胡牌张离开牌河

    const { state: s4 } = applyAction(s3, { type: 'ready', seat: 0 }, rng);
    const { state: s5 } = applyAction(s4, { type: 'ready', seat: 1 }, rng);
    ok(s5);
    expect(s5.banker).toBe(1); // 闲家胜 → 闲家坐庄
    expect(s5.round).toBe(2);
  });

  it('放弃点炮胡：记过张，自己摸牌后重置（规则十二）', () => {
    const s2 = respondState();
    const tile = s2.pending!.tile;
    expect(codeOf(tile)).toBe('B5');

    // 过张期间同一张牌不能点炮胡，但碰不受影响
    const blocked = structuredClone(s2);
    blocked.passTiles[1].push(codeOf(tile));
    expect(claimsOn(blocked, 1, tile).hu).toBe(false);
    expect(claimsOn(blocked, 1, tile).peng).toBe(true);

    // 放弃后立即轮到自己摸牌，过张记录清空（下次再遇同一张可重新判断）
    const { state: s3 } = applyAction(s2, { type: 'pass' }, rng);
    ok(s3);
    expect(s3.phase).toBe('act');
    expect(s3.turn).toBe(1);
    expect(s3.passTiles[1]).toEqual([]);
  });

  it('自摸胡：摸牌后宣言', () => {
    const s = baseMatch('T1 T2 T3 T4 T5 T6 T9 T9 T9 T9 T8 T8 T8 T8', 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B1 B2 B3 B4');
    const work = structuredClone(s);
    for (const code of ['T9', 'T8']) {
      const four = work.hands[0].filter((t) => codeOf(t) === code);
      work.melds[0].push({ type: 'gang', code, tiles: [...four], concealed: true, upgraded: false });
      for (const t of four) work.hands[0].splice(work.hands[0].findIndex((x) => x.id === t.id), 1);
    }
    // 手牌 T1..T6，从牌墙摸进两张 T2 → 123+456+22 自摸
    const t2a = takeOne(work.wall, (t) => codeOf(t) === 'T2');
    const t2b = takeOne(work.wall, (t) => codeOf(t) === 'T2');
    work.hands[0].push(t2a, t2b);
    work.drawnTile = t2b;
    work.claimable = true;
    ok(work); // 8 手牌 + 2 杠 = 14 等价

    const acts = availableActions(work, 0);
    expect(acts.some((a) => a.type === 'hu')).toBe(true);
    const { state: s2 } = applyAction(work, { type: 'hu' }, rng);
    ok(s2);
    expect(s2.result).toMatchObject({ winner: 0, kind: 'zimo' });
    expect(s2.result!.tile!.id).toBe(t2b.id);
    expect(s2.tally.wins).toEqual([1, 0]);
  });
});

describe('非法操作与不可变性（架构文档五）', () => {
  const base = () => baseMatch('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7', PURE_OTHER);

  it('错误阶段/非法牌均被拒绝，原状态不被修改', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    expectRuleError(() => applyAction(s, { type: 'discard', tileId: 99999 }, rng), 'INVALID_TILE');
    expectRuleError(() => applyAction(s, { type: 'peng' }, rng), 'WRONG_PHASE');
    expectRuleError(() => applyAction(s, { type: 'hu' }, rng), 'INVALID_HU'); // 开局不可能满足资格
    expectRuleError(() => applyAction(s, { type: 'choose_flower', suit: 'tong' }, rng), 'WRONG_PHASE');
    expectRuleError(() => applyAction(s, { type: 'ready', seat: 0 }, rng), 'WRONG_PHASE');
    // 拿对手的牌出牌
    const otherTile = s.hands[1][0]!.id;
    expectRuleError(() => applyAction(s, { type: 'discard', tileId: otherTile }, rng), 'INVALID_TILE');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('合法操作也不修改传入状态', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'discard', tileId: byCode(s, 0, 'T1') }, rng);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
