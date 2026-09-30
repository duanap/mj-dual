// SVG 麻将牌面 v3：大图案满版、双色圈纹（白环+高光）、竹节条纹、一条幺鸡、内框描线。
import type { Suit, Tile } from '../src/index';

const BLUE = '#1c4f9c';
const BLUE_D = '#123868';
const RED = '#c0392b';
const RED_D = '#8f2318';
const GREEN = '#186f36';
const GREEN_L = '#3f9e5f';
const GREEN_D = '#0d4a22';

/** x, y, r, 是否红圈 */
type Pip = [number, number, number, 0 | 1];

const DOTS: Record<number, Pip[]> = {
  1: [[20, 28, 13.5, 1]],
  2: [[20, 16.5, 8.5, 1], [20, 39.5, 8.5, 0]],
  3: [[10.5, 13.5, 7, 0], [20, 28, 7, 1], [29.5, 42.5, 7, 0]],
  4: [[12.5, 16, 7.5, 0], [27.5, 16, 7.5, 0], [12.5, 40, 7.5, 0], [27.5, 40, 7.5, 0]],
  5: [[11.5, 15.5, 7, 0], [28.5, 15.5, 7, 0], [20, 28, 7, 1], [11.5, 40.5, 7, 0], [28.5, 40.5, 7, 0]],
  6: [[13, 12.5, 6.8, 0], [27, 12.5, 6.8, 1], [13, 28, 6.8, 0], [27, 28, 6.8, 1], [13, 43.5, 6.8, 0], [27, 43.5, 6.8, 1]],
  7: [[20, 10.5, 6.2, 1], [10.5, 27.5, 6.2, 0], [20, 27.5, 6.2, 0], [29.5, 27.5, 6.2, 0], [10.5, 43, 6.2, 0], [20, 43, 6.2, 0], [29.5, 43, 6.2, 0]],
  8: [[12.5, 10.5, 5.8, 0], [27.5, 10.5, 5.8, 0], [12.5, 22.5, 5.8, 0], [27.5, 22.5, 5.8, 0], [12.5, 34, 5.8, 0], [27.5, 34, 5.8, 0], [12.5, 45.5, 5.8, 0], [27.5, 45.5, 5.8, 0]],
  9: [[10, 12.5, 6.5, 0], [20, 12.5, 6.5, 0], [30, 12.5, 6.5, 0], [10, 28, 6.5, 0], [20, 28, 6.5, 1], [30, 28, 6.5, 0], [10, 43.5, 6.5, 0], [20, 43.5, 6.5, 0], [30, 43.5, 6.5, 0]],
};

/** x, y, 是否红竹 */
const STICKS: Record<number, [number, number, 0 | 1][]> = {
  2: [[14, 28, 0], [26, 28, 1]],
  3: [[10.5, 13.5, 0], [20, 28, 1], [29.5, 42.5, 0]],
  4: [[12.5, 17, 0], [27.5, 17, 0], [12.5, 39, 0], [27.5, 39, 0]],
  5: [[12, 15.5, 0], [28, 15.5, 0], [20, 28, 1], [12, 40.5, 0], [28, 40.5, 0]],
  6: [[13, 13, 0], [27, 13, 0], [13, 28, 0], [27, 28, 0], [13, 43, 0], [27, 43, 0]],
  7: [[20, 11, 1], [10.5, 27, 0], [20, 27, 0], [29.5, 27, 0], [10.5, 42, 0], [20, 42, 0], [29.5, 42, 0]],
  8: [[12.5, 11, 0], [27.5, 11, 0], [12.5, 23, 0], [27.5, 23, 0], [12.5, 34.5, 0], [27.5, 34.5, 0], [12.5, 45.5, 0], [27.5, 45.5, 0]],
  9: [[10, 13, 0], [20, 13, 0], [30, 13, 0], [10, 28, 0], [20, 28, 1], [30, 28, 0], [10, 43, 0], [20, 43, 0], [30, 43, 0]],
};

function dot(p: Pip): string {
  const [x, y, r, red] = p;
  const c = red ? RED : BLUE;
  const cd = red ? RED_D : BLUE_D;
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${cd}" stroke-width="1"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.68).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.3).toFixed(1)}" fill="${c}" stroke="rgba(255,255,255,.4)" stroke-width="0.8"/>` +
    `<circle cx="${(x - r * 0.32).toFixed(1)}" cy="${(y - r * 0.32).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="rgba(255,255,255,.65)"/>`
  );
}

function stick(x: number, y: number, red: boolean): string {
  const w = 7.5;
  const h = 16;
  const base = red ? RED : GREEN;
  const lite = red ? '#e06a5c' : GREEN_L;
  const dark = red ? RED_D : GREEN_D;
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="2.6" fill="${base}" stroke="${dark}" stroke-width="0.8"/>` +
    `<rect x="${-w / 2 + 1}" y="${-h / 2 + 1.5}" width="${w - 2}" height="${h / 2 - 2}" rx="1.6" fill="${lite}"/>` +
    `<line x1="${-w / 2 + 0.8}" y1="0.5" x2="${w / 2 - 0.8}" y2="0.5" stroke="${dark}" stroke-width="0.9"/>` +
    `</g>`
  );
}

/** 一条（幺鸡）：简笔鸟——绿身红喙红尾 */
function bird(): string {
  return (
    `<ellipse cx="20" cy="31" rx="8.5" ry="11.5" fill="${GREEN}" stroke="${GREEN_D}" stroke-width="1"/>` +
    `<ellipse cx="16.8" cy="28.5" rx="4.2" ry="6.8" fill="${GREEN_L}" opacity=".85"/>` +
    `<circle cx="20" cy="15.5" r="5.8" fill="${GREEN}" stroke="${GREEN_D}" stroke-width="1"/>` +
    `<polygon points="25.4,13.8 31.6,16 25.4,18.2" fill="${RED}"/>` +
    `<circle cx="18.4" cy="14" r="1.3" fill="#fff"/>` +
    `<circle cx="18.8" cy="14" r="0.65" fill="#222"/>` +
    `<rect x="13.2" y="41.5" width="3.4" height="9.5" rx="1.6" fill="${RED}" transform="rotate(-14 14.9 46.2)"/>` +
    `<rect x="23.4" y="41.5" width="3.4" height="9.5" rx="1.6" fill="${RED}" transform="rotate(14 25.1 46.2)"/>`
  );
}

function digit(rank: number): string {
  return `<text x="3.5" y="10.5" font-size="9" font-weight="700" font-family="system-ui, sans-serif" fill="rgba(20,40,25,.32)">${rank}</text>`;
}

const FRAME = `<rect x="2.2" y="2.2" width="35.6" height="51.6" rx="3.6" fill="none" stroke="rgba(122,100,60,.22)" stroke-width="1.1"/>`;

export function tileSVG(suit: Suit, rank: number): string {
  const pips =
    suit === 'tong'
      ? (DOTS[rank] ?? []).map(dot).join('')
      : rank === 1
        ? bird()
        : (STICKS[rank] ?? []).map(([x, y, red]) => stick(x, y, red === 1)).join('');
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FRAME}${digit(rank)}${pips}</svg>`;
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
