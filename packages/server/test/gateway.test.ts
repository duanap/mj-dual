// Gateway integration coverage uses real Socket.IO clients and server sessions.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as IoServer } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import { mulberry32 } from '@mj/engine';
import { RoomManager } from '../src/rooms';
import { attachGateway } from '../src/gateway';

let httpServer: HttpServer;
let ioServer: IoServer;
let manager: RoomManager;
let baseUrl: string;
const sockets: Socket[] = [];

const AUTO_MS = 60_000;
const connect = (): Promise<Socket> => {
  const s = io(baseUrl, { transports: ['websocket'], auth: { protocol: 2 }, autoConnect: false });
  sockets.push(s);
  return new Promise((res, rej) => {
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
    s.connect();
  });
};

function once<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((res) => socket.once(event, res));
}

function ack<T = any>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((res) => socket.emit(event, ...args, res));
}

beforeAll(async () => {
  httpServer = createHttpServer();
  ioServer = new IoServer(httpServer, { serveClient: false });
  manager = new RoomManager();
  attachGateway(ioServer, manager, { autoMs: AUTO_MS, rngFactory: () => mulberry32(7) });
  await new Promise<void>((res) => httpServer.listen(0, () => res()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  for (const room of manager.all()) manager.remove(room);
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  ioServer.close();
  await new Promise<void>((res) => httpServer.close(() => res()));
});

describe('联机协议（双客户端）', () => {
  it('等待快照、房主开局、重开、主动退出、旧 token 撤销与解散', async () => {
    const host = await connect();
    const player = await connect();

    const created: any = await ack(host, 'room:create');
    expect(created.error).toBeUndefined();
    expect(created.seat).toBe(0);
    expect(created.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(created.snapshot).toMatchObject({ phase: 'waiting', you: 0, host: 0, view: null, canStart: false });
    expect(created.snapshot).not.toHaveProperty('token');
    const code: string = created.code;

    const waitingAction: any = await ack(host, 'action', { type: 'discard', tileId: 1 });
    expect(waitingAction).toMatchObject({ ok: false, code: 'NOT_STARTED' });

    const hostWaiting = once<any>(host, 'room:snapshot');
    const playerWaiting = once<any>(player, 'room:snapshot');
    const peerOnline = once<any>(host, 'room:peer');
    const joined: any = await ack(player, 'room:join', { code });
    expect(joined.error).toBeUndefined();
    expect(joined).toMatchObject({ seat: 1, snapshot: { phase: 'waiting', you: 1, view: null } });
    expect((await hostWaiting).members[1].connected).toBe(true);
    expect((await playerWaiting).members[0].connected).toBe(true);
    expect(await peerOnline).toMatchObject({ seat: 1, connected: true });

    const outsider = await connect();
    expect(await ack(outsider, 'room:info')).toMatchObject({ ok: false, code: 'NO_ROOM' });

    for (const event of ['room:start', 'room:dissolve', 'room:rematch']) {
      expect(await ack(player, event)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    }

    const startedHost = once<any>(host, 'room:snapshot');
    const startedPlayer = once<any>(player, 'room:snapshot');
    expect(await ack(host, 'room:start')).toMatchObject({ ok: true, snapshot: { phase: 'playing' } });
    expect((await startedHost).view.phase).toBe('choose_flower');
    expect((await startedPlayer).view.phase).toBe('choose_flower');
    expect((await ack(host, 'room:info')).snapshot).toMatchObject({ phase: 'playing', canStart: false });

    // A v2 client cannot use the old ready action as a substitute for host rematch.
    const internalRoom = manager.get(code)!;
    internalRoom.state!.phase = 'settlement';
    internalRoom.state!.result = { winner: null, kind: 'draw' };
    internalRoom.pushState();
    const finishedHost: any = await once(host, 'room:snapshot');
    expect(finishedHost.phase).toBe('finished');
    expect(finishedHost.view.reveal).not.toBeNull();
    expect(finishedHost.view).not.toHaveProperty('ready');
    const ready: any = await ack(player, 'action', { type: 'ready', seat: 0 });
    expect(ready).toMatchObject({ ok: false, code: 'BAD_ACTION' });
    expect(internalRoom.state!.phase).toBe('settlement');

    const rematchHost = once<any>(host, 'room:snapshot');
    const rematchPlayer = once<any>(player, 'room:snapshot');
    expect(await ack(host, 'room:rematch')).toMatchObject({ ok: true, snapshot: { phase: 'playing' } });
    expect((await rematchHost).round).toBe(2);
    expect((await rematchPlayer).phase).toBe('playing');
    expect(await ack(host, 'room:rematch')).toMatchObject({ ok: false, code: 'WRONG_PHASE' });

    const leftHost = once<any>(host, 'room:snapshot');
    const playerClosed = once<any>(player, 'room:closed');
    expect(await ack(player, 'room:leave')).toMatchObject({ ok: true });
    expect(await playerClosed).toMatchObject({ code, reason: 'left' });
    expect(await leftHost).toMatchObject({ phase: 'waiting', members: [{ connected: true }, { connected: false }], view: null });
    expect(await ack(player, 'room:rejoin', { code, token: joined.token })).toMatchObject({ error: 'BAD_TOKEN' });

    const replacement = await connect();
    const replacementJoin: any = await ack(replacement, 'room:join', { code });
    expect(replacementJoin).toMatchObject({ seat: 1, snapshot: { phase: 'waiting' } });
    expect(await ack(replacement, 'room:start')).toMatchObject({ ok: false, code: 'NOT_HOST' });

    const closedHost = once<any>(host, 'room:closed');
    const closedPlayer = once<any>(replacement, 'room:closed');
    expect(await ack(host, 'room:dissolve')).toMatchObject({ ok: true });
    expect(await closedHost).toMatchObject({ code, reason: 'dissolved' });
    expect(await closedPlayer).toMatchObject({ code, reason: 'dissolved' });
    expect(manager.size()).toBe(0);
    expect(await ack(replacement, 'action', { type: 'discard', tileId: 1 })).toMatchObject({ ok: false, code: 'NO_ROOM' });
  });

  it('凭 token 重连恢复座位与本座位视图', async () => {
    const host = await connect();
    const created: any = await ack(host, 'room:create');
    const player = await connect();
    const joined: any = await ack(player, 'room:join', { code: created.code });
    const hostStarted = once<any>(host, 'room:snapshot');
    const playerStarted = once<any>(player, 'room:snapshot');
    await ack(host, 'room:start');
    await hostStarted;
    await playerStarted;

    player.disconnect();
    const reconnected = await connect();
    const restored: any = await ack(reconnected, 'room:rejoin', { code: created.code, token: joined.token });
    expect(restored.error).toBeUndefined();
    expect(restored).toMatchObject({ seat: 1, snapshot: { you: 1, phase: 'playing' } });
    expect(restored.snapshot.view.hand).toHaveLength(13);
  });

  it('旧协议连接只收到明确的刷新提示，不注册旧房间动作', async () => {
    const old = io(baseUrl, { transports: ['websocket'], auth: { protocol: 1 }, autoConnect: false });
    sockets.push(old);
    const prompt = once<any>(old, 'protocol:upgrade-required');
    const disconnected = once<any>(old, 'disconnect');
    await new Promise<void>((res, rej) => {
      old.once('connect', res);
      old.once('connect_error', rej);
      old.connect();
    });
    expect(await prompt).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' });
    await disconnected;
    expect(manager.size()).toBe(0);
  });
});
