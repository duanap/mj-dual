// SVG 麻将牌面 v4：仿实体麻将经典样式——筒为传统雕花圈纹（白瓣环+白芯），
// 条为分节竹（竹节端帽、红竹点缀、传统 2/3/5/7 排布），一条为幺鸡，无角标数字。
import type { Suit, Tile } from '../src/index';

const BLUE = '#2563a8';
const BLUE_D = '#173e6e';
const RED = '#c53a2b';
const RED_D = '#8f2318';
const GREEN = '#1a7a3c';
const GREEN_L = '#4cae6c';
const GREEN_D = '#0d4a22';

/** x, y, r, 是否红圈 */
type Pip = [number, number, number, 0 | 1];

const DOTS: Record<number, Pip[]> = {
  1: [[20, 28, 14, 1]],
  2: [[20, 16, 9, 1], [20, 40, 9, 0]],
  3: [[10.5, 13, 7.5, 0], [20, 28, 7.5, 1], [29.5, 43, 7.5, 0]],
  4: [[12.5, 15.5, 8, 1], [27.5, 15.5, 8, 0], [12.5, 40.5, 8, 0], [27.5, 40.5, 8, 1]],
  5: [[11, 15, 7.5, 0], [29, 15, 7.5, 0], [20, 28, 7.5, 1], [11, 41, 7.5, 0], [29, 41, 7.5, 0]],
  6: [[13, 12.5, 7, 0], [27, 12.5, 7, 1], [13, 28, 7, 0], [27, 28, 7, 1], [13, 43.5, 7, 0], [27, 43.5, 7, 1]],
  7: [[20, 10, 6.5, 1], [10, 27.5, 6.5, 0], [20, 27.5, 6.5, 0], [30, 27.5, 6.5, 0], [10, 43.5, 6.5, 0], [20, 43.5, 6.5, 0], [30, 43.5, 6.5, 0]],
  8: [[12.5, 10, 6, 0], [27.5, 10, 6, 0], [12.5, 22.5, 6, 0], [27.5, 22.5, 6, 0], [12.5, 34.5, 6, 0], [27.5, 34.5, 6, 0], [12.5, 46.5, 6, 0], [27.5, 46.5, 6, 0]],
  9: [[9.5, 12, 6.8, 0], [20, 12, 6.8, 0], [30.5, 12, 6.8, 0], [9.5, 28, 6.8, 0], [20, 28, 6.8, 1], [30.5, 28, 6.8, 0], [9.5, 44, 6.8, 0], [20, 44, 6.8, 0], [30.5, 44, 6.8, 0]],
};

/** x, y, 高, 是否红竹, 倾角 */
type Bam = [number, number, number, 0 | 1, number];

const STICKS: Record<number, Bam[]> = {
  2: [[13.5, 28, 26, 0, -4], [26.5, 28, 26, 1, 4]],
  3: [[20, 12.5, 12, 1, 0], [13.5, 40, 17, 0, -3], [26.5, 40, 17, 0, 3]],
  4: [[13, 16.5, 16, 0, 0], [27, 16.5, 16, 0, 0], [13, 39.5, 16, 0, 0], [27, 39.5, 16, 0, 0]],
  5: [[11.5, 13.5, 14, 0, 0], [28.5, 13.5, 14, 0, 0], [20, 28, 14, 1, 0], [11.5, 42.5, 14, 0, 0], [28.5, 42.5, 14, 0, 0]],
  6: [[10, 14.5, 15, 0, 0], [20, 14.5, 15, 0, 0], [30, 14.5, 15, 0, 0], [10, 41.5, 15, 0, 0], [20, 41.5, 15, 0, 0], [30, 41.5, 15, 0, 0]],
  7: [[20, 10, 11, 1, 0], [10, 28.5, 13, 0, 0], [20, 28.5, 13, 0, 0], [30, 28.5, 13, 0, 0], [10, 45, 13, 0, 0], [20, 45, 13, 0, 0], [30, 45, 13, 0, 0]],
  8: [[13, 10.5, 11, 0, 0], [27, 10.5, 11, 0, 0], [13, 22.5, 11, 0, 0], [27, 22.5, 11, 0, 0], [13, 34.5, 11, 0, 0], [27, 34.5, 11, 0, 0], [13, 46.5, 11, 0, 0], [27, 46.5, 11, 0, 0]],
  9: [[10, 12.5, 14, 0, 0], [20, 12.5, 14, 0, 0], [30, 12.5, 14, 0, 0], [10, 28, 14, 0, 0], [20, 28, 14, 1, 0], [30, 28, 14, 0, 0], [10, 43.5, 14, 0, 0], [20, 43.5, 14, 0, 0], [30, 43.5, 14, 0, 0]],
};

/** 传统雕花筒圈：粗外环 → 内盘 → 8 道白花瓣 → 白芯 */
function dot(p: Pip): string {
  const [x, y, r, red] = p;
  const c = red ? RED : BLUE;
  const ring = Math.max(1.2, r * 0.26);
  let petals = '';
  if (r >= 5.5) {
    const pr = r * 0.55;
    const pw = Math.max(1, r * 0.15);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
      const x1 = (x + Math.cos(a) * r * 0.24).toFixed(1);
      const y1 = (y + Math.sin(a) * r * 0.24).toFixed(1);
      const x2 = (x + Math.cos(a) * pr).toFixed(1);
      const y2 = (y + Math.sin(a) * pr).toFixed(1);
      petals += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,253,244,.92)" stroke-width="${pw.toFixed(1)}" stroke-linecap="round"/>`;
    }
  }
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${ring.toFixed(1)}"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r - ring / 2).toFixed(1)}" fill="${c}"/>` +
    petals +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.2).toFixed(1)}" fill="#fffdf4"/>`
  );
}

/** 分节竹：胶囊身 + 竹节线 + 上下端帽 */
function stick(b: Bam): string {
  const [x, y, h, red, tilt] = b;
  const w = 7;
  const base = red ? RED : GREEN;
  const lite = red ? '#e2695a' : GREEN_L;
  const dark = red ? RED_D : GREEN_D;
  return (
    `<g transform="translate(${x} ${y}) rotate(${tilt})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${base}" stroke="${dark}" stroke-width="0.9"/>` +
    `<rect x="${-w / 2 + 1.1}" y="${-h / 2 + 1.2}" width="${w - 2.2}" height="${h / 2 - 1.6}" rx="${(w - 2.2) / 2}" fill="${lite}"/>` +
    `<line x1="${-w / 2 + 0.6}" y1="0.5" x2="${w / 2 - 0.6}" y2="0.5" stroke="${dark}" stroke-width="1"/>` +
    `<rect x="${-w / 2 - 0.8}" y="${-h / 2 - 1.4}" width="${w + 1.6}" height="2.8" rx="1.4" fill="${dark}"/>` +
    `<rect x="${-w / 2 - 0.8}" y="${h / 2 - 1.4}" width="${w + 1.6}" height="2.8" rx="1.4" fill="${dark}"/>` +
    `</g>`
  );
}

/** 一条（幺鸡）：绿身红翅红尾的简笔鸡 */
function bird(): string {
  return (
    `<path d="M 12.5 39 Q 12 24.5 20 22.5 Q 28 24.5 27.5 39 Q 20 45 12.5 39 Z" fill="${GREEN}" stroke="${GREEN_D}" stroke-width="1"/>` +
    `<path d="M 15 30 Q 21 25.5 25.5 31.5 Q 20 37 15 30 Z" fill="${RED}"/>` +
    `<circle cx="20" cy="15" r="5.8" fill="${GREEN}" stroke="${GREEN_D}" stroke-width="1"/>` +
    `<circle cx="22.6" cy="9.8" r="1.7" fill="${RED}"/>` +
    `<polygon points="25.4,13.6 31.4,15.6 25.4,17.8" fill="${RED}"/>` +
    `<circle cx="18.2" cy="13.8" r="1.35" fill="#fff"/>` +
    `<circle cx="18.6" cy="13.8" r="0.68" fill="#222"/>` +
    `<rect x="12.6" y="40.5" width="3.2" height="10" rx="1.5" fill="${RED}" transform="rotate(-16 14.2 45.5)"/>` +
    `<rect x="24.2" y="40.5" width="3.2" height="10" rx="1.5" fill="${RED}" transform="rotate(16 25.8 45.5)"/>`
  );
}

const FRAME = `<rect x="2.2" y="2.2" width="35.6" height="51.6" rx="3.6" fill="none" stroke="rgba(122,100,60,.22)" stroke-width="1.1"/>`;

export function tileSVG(suit: Suit, rank: number): string {
  const pips =
    suit === 'tong'
      ? (DOTS[rank] ?? []).map(dot).join('')
      : rank === 1
        ? bird()
        : (STICKS[rank] ?? []).map(stick).join('');
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FRAME}${pips}</svg>`;
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
