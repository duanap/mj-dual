// Modern tile faces: consistent spacing, flat ink, restrained detail at small sizes.
import type { Suit, Tile } from '../src/index';

const BLUE = '#244c87';
const RED = '#c44840';
const GREEN = '#227557';
type Mark = [number, number, boolean?];

const DOTS: Record<number, Mark[]> = {
  1: [[20, 28, true]],
  2: [[20, 15, true], [20, 41]],
  3: [[10, 14], [20, 28, true], [30, 42]],
  4: [[11, 15], [29, 15], [11, 41], [29, 41]],
  5: [[10, 14], [30, 14], [20, 28, true], [10, 42], [30, 42]],
  6: [[11, 13], [29, 13], [11, 28], [29, 28], [11, 43], [29, 43]],
  7: [[20, 11, true], [9, 28], [20, 28], [31, 28], [9, 44], [20, 44], [31, 44]],
  8: [[11, 10], [29, 10], [11, 22], [29, 22], [11, 34], [29, 34], [11, 46], [29, 46]],
  9: [[9, 12], [20, 12], [31, 12], [9, 28], [20, 28, true], [31, 28], [9, 44], [20, 44], [31, 44]],
};

const STICKS: Record<number, Mark[]> = {
  2: [[12, 28], [28, 28]],
  3: [[20, 13, true], [12, 40], [28, 40]],
  4: [[12, 15], [28, 15], [12, 41], [28, 41]],
  5: [[10, 14], [30, 14], [20, 28, true], [10, 42], [30, 42]],
  6: [[10, 15], [20, 15], [30, 15], [10, 41], [20, 41], [30, 41]],
  7: [[20, 10, true], [10, 28], [20, 28], [30, 28], [10, 45], [20, 45], [30, 45]],
  8: [[12, 10], [28, 10], [12, 22], [28, 22], [12, 34], [28, 34], [12, 46], [28, 46]],
  9: [[10, 12], [20, 12], [30, 12], [10, 28], [20, 28, true], [30, 28], [10, 44], [20, 44], [30, 44]],
};

function dot([x, y, red]: Mark, rank: number): string {
  const color = red ? RED : BLUE;
  const r = rank === 1 ? 12 : rank <= 2 ? 7 : rank <= 5 ? 5.5 : 4.2;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${rank === 1 ? 3.6 : 2.2}"/>` +
    `<circle class="tile-detail" cx="${x}" cy="${y}" r="${rank === 1 ? 4 : 1.2}" fill="${color}"/>`;
}

function stick([x, y, red]: Mark, rank: number): string {
  const color = red ? RED : GREEN;
  const h = rank === 2 ? 28 : rank === 3 ? 19 : rank === 8 ? 8 : 12;
  const w = rank <= 4 ? 5.5 : 4.6;
  return `<g fill="${color}" transform="translate(${x} ${y})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="1.8"/>` +
    `<path class="tile-detail" d="M ${-w / 2 - .7} ${-h / 2 + 1.5} H ${w / 2 + .7} M ${-w / 2 - .7} ${h / 2 - 1.5} H ${w / 2 + .7} M ${-w / 2 - .5} 0 H ${w / 2 + .5}" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>` +
    `</g>`;
}

function bird(): string {
  return `<path d="M10 39 8 27 15 31 Q13 22 19 18 Q16 10 22 9 Q28 9 27 16 L32 18 26 21 Q29 31 23 38 L28 45 Q17 47 10 39Z" fill="${GREEN}"/>` +
    `<path d="M15 28 Q24 24 25 29 Q23 37 15 35Z" fill="${RED}"/>` +
    `<path d="m20 9 1-5 3 3 3-2 1 5Z" fill="${RED}"/>` +
    `<circle cx="23" cy="14" r="1.1" fill="#fffdf7"/>` +
    `<path d="m16 42-1 6m7-7 2 7" stroke="${RED}" stroke-width="2.3" stroke-linecap="round"/>`;
}

export function tileSVG(suit: Suit, rank: number): string {
  const symbols = suit === 'tong'
    ? (DOTS[rank] ?? []).map((p) => dot(p, rank)).join('')
    : rank === 1 ? bird() : (STICKS[rank] ?? []).map((p) => stick(p, rank)).join('');
  return `<svg viewBox="0 0 40 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${symbols}</svg>`;
}

export function tileFaceHTML(t: Tile, size: string, extra = ''): string {
  const name = tileText(t);
  return `<span class="tface ${size}${extra ? ` ${extra}` : ''}" title="${name}" aria-label="${name}">${tileSVG(t.suit, t.rank)}</span>`;
}

export function tileText(t: Tile): string {
  return `${t.rank}${t.suit === 'tong' ? '筒' : '条'}`;
}

export function backHTML(size: string): string {
  return `<span class="tface back ${size}" aria-label="暗牌"></span>`;
}
