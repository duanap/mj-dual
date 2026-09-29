import type { Seat } from './types';
import type { RNG } from './rng';
import { shuffled } from './rng';
import { createDeck, TOTAL_TILES, type Tile } from './tile';

export interface DealOptions {
  /** 测试用强制手牌：庄家 14 张、闲家 13 张，必须是真实牌 id */
  hands?: [Tile[], Tile[]];
}

export interface DealResult {
  hands: [Tile[], Tile[]];
  wall: Tile[];
}

/**
 * 洗牌发牌（规则三）：庄 14 张、闲 13 张，其余 45 张进牌墙。
 * 牌序完全由注入的 rng 决定，引擎不持有随机状态。
 */
export function deal(rng: RNG, banker: Seat, opts: DealOptions = {}): DealResult {
  const deck = shuffled(rng, createDeck());
  const other = (1 - banker) as Seat;

  if (!opts.hands) {
    const hands: [Tile[], Tile[]] = [[], []];
    hands[banker] = deck.slice(0, 14);
    hands[other] = deck.slice(14, 27);
    return { hands, wall: deck.slice(27) };
  }

  const [forcedBanker, forcedOther] = opts.hands;
  if (forcedBanker.length !== 14 || forcedOther.length !== 13) {
    throw new Error(`强制手牌必须为庄14/闲13，收到 ${forcedBanker.length}/${forcedOther.length}`);
  }
  const ids = [...forcedBanker, ...forcedOther].map((t) => t.id);
  if (new Set(ids).size !== ids.length) throw new Error('强制手牌 id 重复');
  for (const id of ids) {
    if (id < 0 || id >= TOTAL_TILES) throw new Error(`强制手牌 id 越界: ${id}`);
  }
  const used = new Set(ids);
  const hands: [Tile[], Tile[]] = [[], []];
  hands[banker] = [...forcedBanker];
  hands[other] = [...forcedOther];
  return { hands, wall: deck.filter((t) => !used.has(t.id)) };
}
