import type { Suit, Tile } from './tile';
import { otherSuit } from './tile';

export interface ExchangeSummary {
  bankerSuit: Suit;
  /** 庄家手中的异花废牌数 */
  bankerWild: number;
  /** 闲家手中的异花废牌数 */
  otherWild: number;
}

/**
 * 定花交换（规则四）。原地重写 hands[banker]（庄）/ hands[其他]（闲）：
 * 1. 庄家把整门不要的花色交给闲家；
 * 2. 闲家把手中庄家花色补给庄家；
 * 3. 总数不足 14：闲家再用异花垫足（垫入庄家，成为庄家的异花废牌）；
 *    总数超过 14：只补到 14，多余的本门牌留在闲家（成为闲家的异花废牌）。
 * 后置条件：庄 14 / 闲 13（规则四校验）。
 */
export function exchangeFlower(hands: [Tile[], Tile[]], banker: 0 | 1, bankerSuit: Suit): ExchangeSummary {
  const other: 0 | 1 = banker === 0 ? 1 : 0;
  const oSuit = otherSuit(bankerSuit);
  const bankerHand = hands[banker];
  const otherHand = hands[other];

  // 1. 庄家异花全部给闲家
  hands[banker] = bankerHand.filter((t) => t.suit === bankerSuit);
  hands[other] = [...otherHand, ...bankerHand.filter((t) => t.suit !== bankerSuit)];

  // 2. 闲家手中庄家花色补回庄家
  const back = hands[other].filter((t) => t.suit === bankerSuit);
  if (hands[banker].length + back.length <= 14) {
    // 不足：全部要过来，再用闲家异花垫足
    hands[other] = hands[other].filter((t) => t.suit !== bankerSuit);
    hands[banker] = [...hands[banker], ...back];
    const short = 14 - hands[banker].length;
    if (short > 0) {
      hands[banker] = [...hands[banker], ...hands[other].slice(0, short)];
      hands[other] = hands[other].slice(short);
    }
  } else {
    // 超过 14：只补到 14，其余留在闲家
    const need = 14 - hands[banker].length;
    const take = [...back].sort((a, b) => a.id - b.id).slice(0, need);
    const takeIds = new Set(take.map((t) => t.id));
    hands[banker] = [...hands[banker], ...take];
    hands[other] = hands[other].filter((t) => !takeIds.has(t.id));
  }

  if (hands[banker].length !== 14 || hands[other].length !== 13) {
    throw new Error(`交换后手牌数异常：庄${hands[banker].length}/闲${hands[other].length}，应为 14/13`);
  }
  return {
    bankerSuit,
    bankerWild: hands[banker].filter((t) => t.suit !== bankerSuit).length,
    otherWild: hands[other].filter((t) => t.suit !== oSuit).length,
  };
}

/** 超时托管默认：选手牌较多的花色（平票取筒） */
export function suggestFlower(hand: readonly Tile[]): Suit {
  let tong = 0;
  for (const t of hand) if (t.suit === 'tong') tong++;
  return tong * 2 >= hand.length ? 'tong' : 'tiao';
}
