/// <reference path="./svg.d.ts" />
// Face symbols match the user-provided reference; tile body remains CC0.
// See assets/reference/SOURCE.txt and assets/tiles/SOURCE.txt.
import Pin1 from './assets/reference/Pin1.svg';
import Pin2 from './assets/reference/Pin2.svg';
import Pin3 from './assets/reference/Pin3.svg';
import Pin4 from './assets/reference/Pin4.svg';
import Pin5 from './assets/reference/Pin5.svg';
import Pin6 from './assets/reference/Pin6.svg';
import Pin7 from './assets/reference/Pin7.svg';
import Pin8 from './assets/reference/Pin8.svg';
import Pin9 from './assets/reference/Pin9.svg';
import Sou1 from './assets/reference/Sou1.svg';
import Sou2 from './assets/reference/Sou2.svg';
import Sou3 from './assets/reference/Sou3.svg';
import Sou4 from './assets/reference/Sou4.svg';
import Sou5 from './assets/reference/Sou5.svg';
import Sou6 from './assets/reference/Sou6.svg';
import Sou7 from './assets/reference/Sou7.svg';
import Sou8 from './assets/reference/Sou8.svg';
import Sou9 from './assets/reference/Sou9.svg';
import Front from './assets/tiles/Front.svg';
import type { Suit } from '../src/index';

export const TILE_ART: Record<Suit, readonly string[]> = {
  tong: [Pin1, Pin2, Pin3, Pin4, Pin5, Pin6, Pin7, Pin8, Pin9],
  tiao: [Sou1, Sou2, Sou3, Sou4, Sou5, Sou6, Sou7, Sou8, Sou9],
};
export const TILE_FRONT = Front;
