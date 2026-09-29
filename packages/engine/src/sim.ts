// 随机自对弈模拟器（架构文档十二·阶段一验收）
// 无头跑 N 局，统计流局率/胡牌方式/杠类型覆盖，并对每一步做 72 张守恒断言。
import { applyAction, availableActions, currentActors, newMatch } from './engine';
import { assertState } from './validator';
import { mulberry32, type RNG } from './rng';
import { suggestFlower } from './changeFlower';
import { tileById, type TileCode } from './tile';
import type { Action, GameEvent, GameState, Seat } from './types';

type Policy = 'greedy' | 'random';

function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[rng.int(arr.length)]!;
}

function chooseAction(s: GameState, seat: Seat, policy: Policy, rng: RNG): Action {
  const opts = availableActions(s, seat);
  if (opts.length === 0) throw new Error(`无可用动作 phase=${s.phase} seat=${seat} seq=${s.seq}`);
  const hu = opts.find((a) => a.type === 'hu');
  if (hu) return hu; // 永远胡（规则十一：确认机制由策略体现）
  if (s.phase === 'choose_flower') return { type: 'choose_flower', suit: suggestFlower(s.hands[seat]) };
  const gangs = opts.filter((a) => a.type === 'gang');
  if (gangs.length > 0 && rng.int(100) < 80) return pick(rng, gangs);
  const peng = opts.find((a) => a.type === 'peng');
  if (peng && rng.int(100) < 60) return peng;
  const discards = opts.filter((a) => a.type === 'discard');
  if (discards.length > 0) {
    if (policy === 'greedy') {
      const flower = s.flowers[seat]!;
      const wilds = discards.filter((a) => tileById(a.tileId).suit !== flower);
      if (wilds.length > 0) return pick(rng, wilds); // 先打异花废牌
    }
    return pick(rng, discards);
  }
  const pass = opts.find((a) => a.type === 'pass');
  if (pass) return pass;
  const ready = opts.find((a) => a.type === 'ready');
  if (ready) return ready;
  throw new Error('sim: 没有可用动作');
}

interface Stats {
  rounds: number;
  huZimo: number;
  huDianpao: number;
  drawWallEmpty: number;
  drawGangNoReplacement: number;
  peng: number;
  gangMing: number;
  gangAn: number;
  gangBu: number;
  wildRounds: number; // 出现异花废牌的交换
  maxWild: number;
  maxDiscards: number;
  totalDiscards: number;
  issues: string[];
  lastRoundsSample: string[];
}

function emptyStats(): Stats {
  return {
    rounds: 0,
    huZimo: 0,
    huDianpao: 0,
    drawWallEmpty: 0,
    drawGangNoReplacement: 0,
    peng: 0,
    gangMing: 0,
    gangAn: 0,
    gangBu: 0,
    wildRounds: 0,
    maxWild: 0,
    maxDiscards: 0,
    totalDiscards: 0,
    issues: [],
    lastRoundsSample: [],
  };
}

function runMatch(seed: number, policy: Policy, targetRounds: number, stats: Stats): void {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let s = newMatch(seed);
  let guard = 0;
  let roundsPlayed = 0;

  while (roundsPlayed < targetRounds) {
    if (++guard > 100000) throw new Error(`模拟卡死 seed=${seed}`);
    if (s.phase === 'settlement') {
      // 本局结束：统计
      stats.rounds++;
      roundsPlayed++;
      const r = s.result!;
      const discards = s.rivers[0].length + s.rivers[1].length;
      stats.totalDiscards += discards;
      stats.maxDiscards = Math.max(stats.maxDiscards, discards);
      if (r.winner != null) {
        if (r.kind === 'zimo') stats.huZimo++;
        else stats.huDianpao++;
        stats.lastRoundsSample.push(`r${s.round} seat${r.winner} ${r.kind === 'zimo' ? '自摸' : '点炮'} ${r.tile?.rank}${r.tile?.suit === 'tong' ? '筒' : '条'} 出牌${discards}`);
      } else {
        if (r.reason === 'gang_no_replacement') stats.drawGangNoReplacement++;
        else stats.drawWallEmpty++;
        stats.lastRoundsSample.push(`r${s.round} 流局(${r.reason}) 出牌${discards}`);
      }
      for (const seat of currentActors(s)) {
        const res = applyAction(s, { type: 'ready', seat }, rng);
        s = res.state;
        assertState(s);
      }
      continue;
    }

    const seat = currentActors(s)[0]!;
    const before = s;
    const action = chooseAction(before, seat, policy, rng);
    const { state, events } = applyAction(before, action, rng);
    for (const e of events) countEvent(e, stats);
    try {
      assertState(state);
    } catch (err) {
      console.error(`\n[状态校验失败] seed=${seed} policy=${policy} seq=${before.seq} phase=${before.phase} action=${JSON.stringify(action)}`);
      console.error(`  错误: ${(err as Error).message}`);
      console.error(`  before: turn=${before.turn} hands=${before.hands.map((h) => h.length + '+' + before.melds[before.hands.indexOf(h)]?.length).join('/')}`);
      throw err;
    }
    s = state;
  }
}

function countEvent(e: GameEvent, stats: Stats): void {
  switch (e.type) {
    case 'peng':
      stats.peng++;
      break;
    case 'gang':
      if (e.kind === 'ming') stats.gangMing++;
      else if (e.kind === 'an') stats.gangAn++;
      else stats.gangBu++;
      break;
    case 'exchanged':
      if (e.bankerWild > 0 || e.otherWild > 0) stats.wildRounds++;
      stats.maxWild = Math.max(stats.maxWild, e.bankerWild, e.otherWild);
      break;
    default:
      break;
  }
}

function fmt(n: number, total: number): string {
  const pct = total > 0 ? ((n / total) * 100).toFixed(2) : '0.00';
  return `${n} (${pct}%)`;
}

function main(): void {
  const seeds = 100;
  const roundsPerMatch = 100;
  const stats = emptyStats();

  for (let seed = 1; seed <= seeds; seed++) {
    runMatch(seed, 'greedy', roundsPerMatch, stats);
    runMatch(seed + 10000, 'random', roundsPerMatch, stats);
  }

  const totalRounds = stats.rounds;
  const totalGangs = stats.gangMing + stats.gangAn + stats.gangBu;
  const totalHu = stats.huZimo + stats.huDianpao;
  const totalDraw = stats.drawWallEmpty + stats.drawGangNoReplacement;
  console.log('=== 两人两杠起胡麻将 随机自对弈报告 ===');
  console.log(`对局 ${seeds * 2} 场，共 ${totalRounds} 局（greedy + random 双策略）`);
  console.log('');
  console.log('结果分布:');
  console.log(`  胡牌      ${fmt(totalHu, totalRounds)}`);
  console.log(`    自摸    ${fmt(stats.huZimo, totalRounds)}`);
  console.log(`    点炮    ${fmt(stats.huDianpao, totalRounds)}`);
  console.log(`  流局      ${fmt(totalDraw, totalRounds)}`);
  console.log(`    牌墙摸完 ${fmt(stats.drawWallEmpty, totalRounds)}`);
    console.log(`    杠后无补 ${fmt(stats.drawGangNoReplacement, totalRounds)}`);
  console.log('');
  console.log('操作统计:');
  console.log(`  碰        ${stats.peng}`);
  console.log(`  杠合计    ${totalGangs}`);
  console.log(`    明杠    ${stats.gangMing}`);
  console.log(`    暗杠    ${stats.gangAn}`);
  console.log(`    补杠    ${stats.gangBu}`);
  console.log(`  平均出牌/局 ${(stats.totalDiscards / totalRounds).toFixed(1)}，最多 ${stats.maxDiscards}`);
  console.log(`  出现异花废牌的交换 ${fmt(stats.wildRounds, totalRounds)}，单家最多 ${stats.maxWild} 张`);
  console.log('');
  console.log('末尾若干局:');
  for (const line of stats.lastRoundsSample.slice(-8)) console.log(`  ${line}`);

  if (stats.issues.length > 0) {
    console.error(`\n状态校验失败 ${stats.issues.length} 处：`);
    for (const i of stats.issues.slice(0, 5)) console.error(`  ${i}`);
    process.exit(1);
  }
  const required: Array<[string, number]> = [
    ['自摸', stats.huZimo],
    ['点炮', stats.huDianpao],
    ['流局', totalDraw],
    ['碰', stats.peng],
    ['明杠', stats.gangMing],
    ['暗杠', stats.gangAn],
    ['补杠', stats.gangBu],
  ];
  const missing = required.filter(([, n]) => n === 0).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`\n覆盖缺口：${missing.join('、')} 从未发生，策略需要调整`);
    process.exit(1);
  }
  console.log('\n72 张守恒与阶段不变量全程通过；关键事件全覆盖。');
}

main();
