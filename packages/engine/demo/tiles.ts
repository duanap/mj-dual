// SVG 麻将牌面：筒（蓝圈）/ 条（绿竹），纯矢量零资源。
import type { Suit, Tile } from '../src/index';

const DOTS: Record<number, [number, number, number][]> = {
  1: [[20, 28, 11]],
  2: [[20, 15, 6.5], [20, 41, 6.5]],
  3: [[10, 13, 5.5], [20, 28, 5.5], [30, 43, 5.5]],
  4: [[12, 16, 6], [28, 16, 6], [12, 40, 6], [28, 40, 6]],
  5: [[12, 16, 5.5], [28, 16, 5.5], [20, 28, 5.5], [12, 40, 5.5], [28, 40, 5.5]],
  6: [[13, 13, 5.5], [27, 13, 5.5], [13, 28, 5.5], [27, 28, 5.5], [13, 43, 5.5], [27, 43, 5.5]],
  7: [[20, 11, 5], [10, 27, 5], [20, 27, 5], [30, 27, 5], [10, 42, 5], [20, 42, 5], [30, 42, 5]],
  8: [[13, 11, 4.6], [27, 11, 4.6], [13, 23, 4.6], [27, 23, 4.6], [13, 34, 4.6], [27, 34, 4.6], [13, 45, 4.6], [27, 45, 4.6]],
  9: [[10, 13, 5], [20, 13, 5], [30, 13, 5], [10, 28, 5], [20, 28, 5], [30, 28, 5], [10, 43, 5], [20, 43, 5], [30, 43, 5]],
};

const STICKS: Record<number, [number, number][]> = {
  1: [[20, 28]],
  2: [[14, 28], [26, 28]],
  3: [[11, 14], [20, 28], [29, 42]],
  4: [[13, 17], [27, 17], [13, 39], [27, 39]],
  5: [[13, 16], [27, 16], [20, 28], [13, 40], [27, 40]],
  6: [[13, 13], [27, 13], [13, 28], [27, 28], [13, 43], [27, 43]],
  7: [[20, 11], [10, 27], [20, 27], [30, 27], [10, 42], [20, 42], [30, 42]],
  8: [[13, 11], [27, 11], [13, 23], [27, 23], [13, 34], [27, 34], [13, 45], [27, 45]],
  9: [[10, 13], [20, 13], [30, 13], [10, 28], [20, 28], [30, 28], [10, 43], [20, 43], [30, 43]],
};

function dots(rank: number): string {
  return (DOTS[rank] ?? [])
    .map(
      ([x, y, r]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="#1e5aa8"/><circle cx="${x}" cy="${y}" r="${(r * 0.55).toFixed(1)}" fill="none" stroke="#9cc2ea" stroke-width="1.4"/>`,
    )
    .join('');
}

function sticks(rank: number): string {
  return (STICKS[rank] ?? [])
    .map(([x, y]) => {
      const w = rank === 1 ? 9 : 6;
      const h = rank === 1 ? 30 : 15;
      return `<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="2.2" fill="#1c7a3a"/><rect x="${-w / 2 + 1}" y="${-h / 2 + 2}" width="${w - 2}" height="${Math.max(2, h / 2 - 3)}" rx="1.4" fill="#3aa661"/></g>`;
    })
    .join('');
}

export function tileSVG(suit: Suit, rank: number): string {
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${suit === 'tong' ? dots(rank) : sticks(rank)}</svg>`;
}

export function tileFaceHTML(t: Tile, size: string, extra = ''): string {
  return `<span class="tface ${size}${extra ? ` ${extra}` : ''}" title="${t.rank}${t.suit === 'tong' ? '筒' : '条'}">${tileSVG(t.suit, t.rank)}</span>`;
}

export function tileText(t: Tile): string {
  return `${t.rank}${t.suit === 'tong' ? '筒' : '条'}`;
}

export function backHTML(size: string): string {
  return `<span class="tface back ${size}"></span>`;
}
