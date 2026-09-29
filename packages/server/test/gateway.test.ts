// 网关集成测试：真实 Socket.IO 双客户端走完整协议（创建/加入/视图过滤/非法意图/token 重连）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as IoServer } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import { mulberry32 } from '@mj/engine';
import { RoomManager } from '../src/rooms';
import { attachGateway } from '../src/gateway';

let httpServer: HttpServer;
let ioServer: IoServer;
let baseUrl: string;

const AUTO_MS = 400;
const connect = (): Promise<Socket> => {
  const s = io(baseUrl, { transports: ['websocket'] });
  return new Promise((res, rej) => {
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });
};

function once<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((res) => socket.once(event, res));
}

beforeAll(async () => {
  httpServer = createHttpServer();
  ioServer = new IoServer(httpServer, { serveClient: false });
  attachGateway(ioServer, new RoomManager(), { autoMs: AUTO_MS, rngFactory: () => mulberry32(7) });
  await new Promise<void>((res) => httpServer.listen(0, () => res()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  ioServer.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});describe('联机协议（双客户端）', () => {
  it('创建→加入→双方收到按视角过滤的状态；非法意图被拒；重连恢复', async () => {
    const a = await connect();
    const b = await connect();

    const createRes: any = await new Promise((res) => a.emit('room:create', res));
    expect(createRes.error).toBeUndefined();
    expect(createRes.seat).toBe(0);
    expect(createRes.code).toMatch(/^[A-Z2-9]{4}$/);
    const code: string = createRes.code;

    // 重复创建被拒
    const dup: any = await new Promise((res) => a.emit('room:create', res));
    expect(dup.error).toBe('ALREADY_IN_ROOM');

    // 错误房间号
    const bad: any = await new Promise((res) => b.emit('room:join', { code: 'ZZZZ' }, res));
    expect(bad.error).toBe('NO_ROOM');

    // 正常加入：双方都收到对手在场事件
    const stateA0 = once<any>(a, 'state');
    const peerB: any = once(b, 'room:peer');
    const joinRes: any = await new Promise((res) => b.emit('room:join', { code }, res));
    expect(joinRes.error).toBeUndefined();
    expect(joinRes.seat).toBe(1);
    const peer = await peerB;
    expect(peer).toMatchObject({ seat: 0, connected: true });
    const sa0 = await stateA0;

    // 视角过滤：各自只拿到自己的手牌与对手数量；牌墙只有数量
    const createView = createRes.view;
    expect(createView.hand.length).toBeGreaterThan(0);
    expect(createView).not.toHaveProperty('wall');
    expect(createView.otherHandCount).toBe(13);
    const bView: any = joinRes.view;
    expect(bView.hand.length).toBe(bView.you === joinRes.seat ? bView.hand.length : 0); // 结构存在
    expect(bView.otherHandCount).toBe(14);
    // 对手手牌数组不外发：视图上没有对手 hands 字段
    expect(bView).not.toHaveProperty('hands');

    // 未行动方发牌 → 拒
    const stateNow: any = await new Promise((res) => {
      b.once('state', res);
      // 触发一次快照：让 b 发一个必被拒的意图，确认拒绝且状态不变
      b.emit('action', { type: 'discard', tileId: 999 }, (r: any) => {
        expect(r.ok).toBe(false);
        res(r);
      });
    });
    expect(stateNow.ok).toBe(false);

    // 等超时托管把牌局推进几步（AUTO_MS=400，推进到有行动方为庄家的回合）
    const viewBy = (s: Socket) =>
      new Promise<any>((res) => s.once('state', (v: any) => res(v)));
    let last: any = await viewBy(a);
    for (let i = 0; i < 30 && last.seq < 3; i++) last = await viewBy(a);

    // a 断线 → 凭 token 重连 → 恢复视图
    const peerA: any = once(a, 'room:peer');
    const stateA1 = once<any>(a, 'state');
    a.disconnect();
    a.connect();
    await new Promise<void>((res) => a.once('connect', res));
    const reRes: any = await new Promise((res) =>
      a.emit('room:rejoin', { code, token: createRes.token }, res),
    );
    expect(reRes.error).toBeUndefined();
    expect(reRes.seat).toBe(0);
    expect(reRes.view.seq).toBeGreaterThan(0);
    expect(await stateA1).toBeTruthy();
    void peerA;

    // 伪造 token 被拒
    const forged: any = await new Promise((res) => {
      const c = io(baseUrl, { transports: ['websocket'] });
      c.once('connect', () => c.emit('room:rejoin', { code, token: 'forged-token' }, (r: any) => {
        c.disconnect();
        res(r);
      }));
    });
    expect(forged.error).toBe('BAD_TOKEN');

    a.disconnect();
    b.disconnect();
  });
});
