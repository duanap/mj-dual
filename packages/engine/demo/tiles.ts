import type { Tile } from '../src/index';
import { TILE_ART, TILE_FRONT } from './tile-art';

// The bundler's SVG data URLs may contain quotes; HTML attributes must escape them.
const imageSource = (src: string): string => src.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function tileFaceHTML(t: Tile, size: string, extra = ''): string {
  const name = tileText(t);
  const src = imageSource(TILE_ART[t.suit][t.rank - 1]);
  return `<span class="tface ${size}${extra ? ` ${extra}` : ''}" title="${name}" aria-label="${name}"><img class="tile-front" src="${imageSource(TILE_FRONT)}" alt="" draggable="false"><img class="tile-art" src="${src}" alt="" draggable="false"></span>`;
}

export function tileText(t: Tile): string {
  return `${t.rank}${t.suit === 'tong' ? '筒' : '条'}`;
}

export function backHTML(size: string): string {
  return `<span class="tface back ${size}" aria-label="暗牌"></span>`;
}
