/// <reference path="./svg.d.ts" />
// CC0 classic artwork from FluffyStuff/riichi-mahjong-tiles; see assets/tiles/SOURCE.txt.
import Pin1 from './assets/tiles/Pin1.svg';
import Pin2 from './assets/tiles/Pin2.svg';
import Pin3 from './assets/tiles/Pin3.svg';
import Pin4 from './assets/tiles/Pin4.svg';
import Pin5 from './assets/tiles/Pin5.svg';
import Pin6 from './assets/tiles/Pin6.svg';
import Pin7 from './assets/tiles/Pin7.svg';
import Pin8 from './assets/tiles/Pin8.svg';
import Pin9 from './assets/tiles/Pin9.svg';
import Sou1 from './assets/tiles/Sou1.svg';
import Sou2 from './assets/tiles/Sou2.svg';
import Sou3 from './assets/tiles/Sou3.svg';
import Sou4 from './assets/tiles/Sou4.svg';
import Sou5 from './assets/tiles/Sou5.svg';
import Sou6 from './assets/tiles/Sou6.svg';
import Sou7 from './assets/tiles/Sou7.svg';
import Sou8 from './assets/tiles/Sou8.svg';
import Sou9 from './assets/tiles/Sou9.svg';
import Front from './assets/tiles/Front.svg';
import type { Suit } from '../src/index';

export const TILE_ART: Record<Suit, readonly string[]> = {
  tong: [Pin1, Pin2, Pin3, Pin4, Pin5, Pin6, Pin7, Pin8, Pin9],
  tiao: [Sou1, Sou2, Sou3, Sou4, Sou5, Sou6, Sou7, Sou8, Sou9],
};
export const TILE_FRONT = Front;
