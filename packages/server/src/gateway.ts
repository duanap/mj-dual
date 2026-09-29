// Socket.IO 网关：协议即架构文档十的落地——客户端只发意图，座位由会话决定。
import type { Server, Socket } from 'socket.io';
import { RoomManager, type Room, type RoomOptions, type SendFn } from './rooms';
import type { Seat } from '@mj/engine';

type Ack = (r: unknown) => void;

interface Session {
  room: Room;
  seat: Seat;
}

export function attachGateway(io: Server, manager: RoomManager, opts: RoomOptions = {}): void {
  /** 座位 → 在线 socket 的投递（离线座位静默丢弃）。闭包引用房间变量本身，创建后再赋值。 */
  const sendFor = (roomRef: { room?: Room }): SendFn => (seat, event, payload) => {
    const sid = roomRef.room?.sids[seat];
    if (sid) io.to(sid).emit(event, payload);
  };

  let connSeq = 0;
  io.on('connection', (socket: Socket) => {
    if (process.env.MJ_DEBUG_CREATE) console.error('[debug] connection', socket.id, 'n=', ++connSeq, 'at', new Date().toISOString());
    let session: Session | null = null;

    const enter = (room: Room, seat: Seat, token: string): void => {
      session = { room, seat };
      socket.join(`room:${room.code}`);
    };

    socket.on('room:create', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (process.env.MJ_DEBUG_CREATE) console.error('[debug] room:create from', socket.id, 'headers-handshake:', JSON.stringify(socket.handshake.headers['user-agent'] ?? ''));
      if (session) return ack({ error: 'ALREADY_IN_ROOM' });
      const ref: { room?: Room } = {};
      const room = manager.create(sendFor(ref), opts);
      ref.room = room;
      if (!room.bind(socket.id, 0, room.tokens[0])) return ack({ error: 'BIND_FAILED' });
      enter(room, 0, room.tokens[0]);
      ack({ code: room.code, seat: 0, token: room.tokens[0], view: room.view(0) });
    });

    socket.on('room:join', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (session) return ack({ error: 'ALREADY_IN_ROOM' });
      const code = typeof (raw as { code?: unknown })?.code === 'string' ? (raw as { code: string }).code.trim().toUpperCase() : '';
      const room = manager.get(code);
      if (!room) return ack({ error: 'NO_ROOM' });
      const issued = room.issueSeat1();
      if (!issued) return ack({ error: 'ROOM_FULL' });
      if (!room.bind(socket.id, 1, issued.token)) return ack({ error: 'BIND_FAILED' });
      enter(room, 1, issued.token);
      ack({ code: room.code, seat: 1, token: issued.token, view: room.view(1) });
    });

    socket.on('room:rejoin', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (session) return ack({ error: 'ALREADY_IN_ROOM' });
      const code = typeof (raw as { code?: unknown })?.code === 'string' ? (raw as { code: string }).code.trim().toUpperCase() : '';
      const token = typeof (raw as { token?: unknown })?.token === 'string' ? (raw as { token: string }).token : '';
      const room = manager.get(code);
      if (!room) return ack({ error: 'NO_ROOM' });
      const seat = room.seatByToken(token);
      if (seat == null) return ack({ error: 'BAD_TOKEN' });
      if (!room.bind(socket.id, seat, token)) return ack({ error: 'BIND_FAILED' });
      enter(room, seat, token);
      ack({ code: room.code, seat, token, view: room.view(seat) });
    });

    socket.on('action', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (!session) return ack({ ok: false, code: 'NO_ROOM', message: '尚未加入房间' });
      // 座位可能已被新连接顶掉：只有当前绑定者可以操作
      if (session.room.sids[session.seat] !== socket.id) {
        return ack({ ok: false, code: 'STALE_SESSION', message: '会话已在其他页面打开' });
      }
      ack(session.room.action(session.seat, raw));
    });

    socket.on('disconnect', () => {
      if (!session) return;
      const { room } = session;
      session = null;
      room.unbind(socket.id);
      manager.sweep();
    });
  });
}
