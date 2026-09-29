// 生产服务端专用 CSPRNG。刻意不从 index.ts 导出：避免 node:crypto 进入浏览器构建，
// 服务端按需 import { cryptoRng } from '@mj/engine/src/rng.node'。
import { randomInt } from 'node:crypto';
import type { RNG } from './rng';

/** 密码学安全的随机源：每场对局一份，同一实例贯穿 newMatch 与本场所有 applyAction（含续局重发）。 */
export const cryptoRng: RNG = {
  int(n: number): number {
    if (n <= 0) throw new Error(`RNG.int 需要正整数，收到 ${n}`);
    return randomInt(n); // node:crypto 内部做拒绝采样，均匀无偏
  },
};
