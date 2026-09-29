// SVG 麻将牌面：筒（蓝红圈）/ 条（绿竹，幺鸡红杆），纯矢量零资源；左上角小数字辅助识牌。
import type { Suit, Tile } from '../src/index';

const BLUE = '#1e5aa8';
const RED = '#c23a2b';
const GREEN = '#1c7a3a';
const GREEN_L = '#3aa661';

/** x, y, r, 是否红圈 */
type Pip = [number, number, number, 0 | 1];

const DOTS: Record<number, Pip[]> = {
  1: [[20, 28, 11, 1]],
  2: [[20, 15, 6.5, 1], [20, 41, 6.5, 0]],
  3: [[10, 13, 5.5, 0], [20, 28, 5.5, 1], [30, 43, 5.5, 0]],
  4: [[12, 16, 6, 0], [28, 16, 6, 0], [12, 40, 6, 0], [28, 40, 6, 0]],
  5: [[12, 16, 5.5, 0], [28, 16, 5.5, 0], [20, 28, 5.5, 1], [12, 40, 5.5, 0], [28, 40, 5.5, 0]],
  6: [[13, 13, 5.5, 0], [27, 13, 5.5, 1], [13, 28, 5.5, 0], [27, 28, 5.5, 1], [13, 43, 5.5, 0], [27, 43, 5.5, 1]],
  7: [[20, 11, 5, 1], [10, 27, 5, 0], [20, 27, 5, 0], [30, 27, 5, 0], [10, 42, 5, 0], [20, 42, 5, 0], [30, 42, 5, 0]],
  8: [[13, 11, 4.6, 0], [27, 11, 4.6, 0], [13, 23, 4.6, 0], [27, 23, 4.6, 0], [13, 34, 4.6, 0], [27, 34, 4.6, 0], [13, 45, 4.6, 0], [27, 45, 4.6, 0]],
  9: [[10, 13, 5, 0], [20, 13, 5, 0], [30, 13, 5, 0], [10, 28, 5, 0], [20, 28, 5, 1], [30, 28, 5, 0], [10, 43, 5, 0], [20, 43, 5, 0], [30, 43, 5, 0]],
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

function dot(p: Pip): string {
  const [x, y, r, red] = p;
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${red ? RED : BLUE}" stroke="rgba(0,0,0,.22)" stroke-width="0.6"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.62).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/>` +
    `<circle cx="${(x - r * 0.3).toFixed(1)}" cy="${(y - r * 0.3).toFixed(1)}" r="${(r * 0.24).toFixed(1)}" fill="rgba(255,255,255,.55)"/>`
  );
}

function stick(x: number, y: number, red: boolean): string {
  const big = red; // 仅 1条
  const w = big ? 9 : 6;
  const h = big ? 30 : 15;
  const base = red ? '#b0342a' : GREEN;
  const lite = red ? '#e06a5c' : GREEN_L;
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="2.2" fill="${base}" stroke="rgba(0,0,0,.2)" stroke-width="0.5"/>` +
    `<rect x="${-w / 2 + 1}" y="${-h / 2 + 2}" width="${w - 2}" height="${Math.max(2, h / 2 - 3)}" rx="1.4" fill="${lite}"/>` +
    `</g>`
  );
}

function digit(rank: number): string {
  return `<text x="3" y="9.5" font-size="8.5" font-weight="700" font-family="system-ui, sans-serif" fill="rgba(20,40,25,.4)">${rank}</text>`;
}

export function tileSVG(suit: Suit, rank: number): string {
  const pips =
    suit === 'tong'
      ? (DOTS[rank] ?? []).map(dot).join('')
      : (STICKS[rank] ?? []).map(([x, y]) => stick(x, y, rank === 1)).join('');
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${digit(rank)}${pips}</svg>`;
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
