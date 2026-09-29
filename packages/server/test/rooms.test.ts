import { describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '@mj/engine';
import { Room, RoomManager } from '../src/rooms';

interface Sent { seat: 0 | 1; event: string; payload: any }

function mkRoom(autoMs = 20_000) {
  const sent: Sent[] = [];
  const room = new Room('TEST', (seat, event, payload) => sent.push({ seat, event, payload }), {
    autoMs,
    rngFactory: () => mulberry32(42),
  });
  const lastView = (seat: 0 | 1) => [...sent].reverse().find((s) => s.seat === seat && s.event === 'state')!.payload;
  return { room, sent, lastView };
}

describe('Room 房间与座位绑定', () => {
  it('创建即发牌；加入后双方收到状态与对手在场事件', () => {
    const { room, sent, lastView } = mkRoom();
    expect(room.state.phase).toBe('choose_flower');
    expect(room.bind('s0', 0, 'wrong-token')).toBe(false);
    expect(room.bind('s0', 0, room.tokens[0])).toBe(true);
    expect(room.bind('s1', 1, room.tokens[1])).toBe(true);
    const v0 = lastView(0);
    expect(v0.you).toBe(0);
    expect(v0.hand.length).toBe(room.state.banker === 0 ? 14 : 13);
    expect(v0.otherHandCount).toBe(room.state.banker === 0 ? 13 : 14);
    expect(v0.yourActions.every((a: any) => a.type === 'choose_flower' ? v0.you === room.state.banker : true)).toBe(true);
    expect(sent.some((s) => s.event === 'room:peer' && s.payload.connected === true)).toBe(true);
  });

  it('座位1只发放一次 token；重连必须凭 token', () => {
    const { room } = mkRoom();
    const issued = room.issueSeat1();
    expect(issued?.seat).toBe(1);
    expect(room.issueSeat1()).toBeNull(); // 第三人拿不到座位1
    expect(room.seatByToken(issued!.token)).toBe(1);
    expect(room.seatByToken('forged')).toBeNull();
  });

  it('非当前行动座位的意图被拒；座位盖章后的合法意图通过', () => {
    const { room } = mkRoom();
    room.bind('s0', 0, room.tokens[0]);
    room.bind('s1', 1, room.tokens[1]);
    const banker = room.state.banker;
    const other = (1 - banker) as 0 | 1;
    // 非庄家试图定花 → 拒
    expect(room.action(other, { type: 'choose_flower', suit: 'tong' }).ok).toBe(false);
    // 伪装成带 seat 字段的 ready → normalize 后座位被服务端重写，仍在定花阶段被拒
    expect(room.action(other, { type: 'ready', seat: banker }).ok).toBe(false);
    // 庄家定花 → 通过，进入 act
    expect(room.action(banker, { type: 'choose_flower', suit: 'tong' }).ok).toBe(true);
    expect(room.state.phase).toBe('act');
    // 非行动方试图出牌 → 拒
    expect(room.action(other, { type: 'discard', tileId: room.state.hands[other][0]!.id }).ok).toBe(false);
    // 行动方出非法 tileId → 被前置合法性拒绝（availableActions 里没有这个 tileId）
    const legalIds = new Set(room.state.hands[banker].map((t) => t.id));
    const fakeId = [...Array(72).keys()].find((i) => !legalIds.has(i))!;
    expect(room.action(banker, { type: 'discard', tileId: fakeId }).ok).toBe(false);
    // 行动方出合法牌 → 通过
    const tile = room.state.hands[banker][0]!;
    expect(room.action(banker, { type: 'discard', tileId: tile.id }).ok).toBe(true);
    expect(room.state.seq).toBe(2);
  });

  it('格式非法的意图被拒', () => {
    const { room } = mkRoom();
    room.bind('s0', 0, room.tokens[0]);
    room.bind('s1', 1, room.tokens[1]);
    expect(room.action(0, { type: 'hack' }).ok).toBe(false);
    expect(room.action(0, { type: 'discard', tileId: 'x' }).ok).toBe(false);
    expect(room.action(0, null).ok).toBe(false);
  });

  it('超时托管：定花/出牌超时自动代打；断线玩家托管更快', () => {
    vi.useFakeTimers();
    try {
      const { room } = mkRoom(5_000);
      room.bind('s0', 0, room.tokens[0]);
      room.bind('s1', 1, room.tokens[1]);
      const seq0 = room.state.seq;
      vi.advanceTimersByTime(5_100); // 定花超时 → 自动定花
      expect(room.state.phase).toBe('act');
      vi.advanceTimersByTime(5_100); // act 超时 → 自动出牌
      expect(room.state.seq).toBeGreaterThanOrEqual(seq0 + 2);
      expect(room.state.phase).toBe('act'); // 对家摸牌后继续等行动
      // 断线托管更快（4s）
      room.unbind(room.sids[room.state.turn]!);
      vi.advanceTimersByTime(4_100);
      expect(room.state.seq).toBeGreaterThanOrEqual(seq0 + 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('被顶掉的座位连接收到 room:kicked，座位绑定让位给新连接', () => {
    const { room, sent } = mkRoom();
    room.bind('s0', 0, room.tokens[0]);
    room.bind('s1a', 1, room.tokens[1]);
    room.bind('s1b', 1, room.tokens[1]); // 同 token 二次绑定 = 顶掉旧连接
    expect(room.sids[1]).toBe('s1b');
    expect(sent.some((s) => s.event === 'room:kicked')).toBe(true);
  });

  it('无人在线时牌局冻结，有人回来即恢复托管', () => {
    vi.useFakeTimers();
    try {
      const { room } = mkRoom(5_000);
      room.bind('s0', 0, room.tokens[0]);
      room.bind('s1', 1, room.tokens[1]);
      vi.advanceTimersByTime(5_100); // 托管定花
      const seq = room.state.seq;
      expect(seq).toBeGreaterThan(0);
      room.unbind('s0');
      room.unbind('s1');
      vi.advanceTimersByTime(60_000);
      expect(room.state.seq).toBe(seq); // 冻结：不推进
      room.bind('s0', 0, room.tokens[0]); // 一人回来即恢复（对家按掉线 4s 托管）
      vi.advanceTimersByTime(4_100);
      expect(room.state.seq).toBeGreaterThan(seq);
    } finally {
      vi.useRealTimers();
    }
  });

  it('空房间按 TTL 清理', () => {
    const manager = new RoomManager();
    const room = manager.create(() => {}, { rngFactory: () => mulberry32(1) });
    room.bind('s0', 0, room.tokens[0]);
    room.bind('s1', 1, room.tokens[1]);
    expect(manager.size()).toBe(1);
    room.unbind('s0');
    room.unbind('s1');
    manager.sweep(Date.now() + 1);
    expect(manager.size()).toBe(1); // 未过 TTL
    manager.sweep(Date.now() + 10 * 60_000 + 1);
    expect(manager.size()).toBe(0);
  });
});
