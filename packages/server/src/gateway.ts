// Socket.IO 房间协议：会话、角色和本人的对局视图均由服务端决定。
import type { Server, Socket } from 'socket.io';
import { RoomManager, type Room, type RoomOptions, type SendFn } from './rooms';
import type { RoomControlResult } from './protocol';
import type { Seat } from '@mj/engine';

type Ack = (result: unknown) => void;
interface Session {
  room: Room;
  seat: Seat;
}
interface SessionRef {
  current: Session | null;
}

const noRoom = () => ({ ok: false, code: 'NO_ROOM', message: '尚未加入房间' });
const staleSession = () => ({ ok: false, code: 'STALE_SESSION', message: '会话已在其他页面打开' });

export function attachGateway(io: Server, manager: RoomManager, opts: RoomOptions = {}): void {
  /** 座位 → 当前 socket 的投递；Socket.IO 的 user room 直接以 sid 定向。 */
  const sendFor = (roomRef: { room?: Room }): SendFn => (seat, event, payload) => {
    const sid = roomRef.room?.sids[seat];
    if (sid) io.to(sid).emit(event, payload);
  };

  const sessions = new Map<string, SessionRef>();
  io.on('connection', (socket: Socket) => {
    const protocol = (socket.handshake.auth as Record<string, unknown> | undefined)?.protocol;
    if (protocol !== 2) {
      socket.emit('protocol:upgrade-required', {
        code: 'CLIENT_UPDATE_REQUIRED',
        message: '游戏版本已更新，请刷新页面后重新加入房间',
      });
      socket.disconnect(true);
      return;
    }

    const sessionRef: SessionRef = { current: null };
    sessions.set(socket.id, sessionRef);

    const enter = (room: Room, seat: Seat): void => {
      sessionRef.current = { room, seat };
      socket.join(`room:${room.code}`);
    };

    const member = (ack: Ack): Session | null => {
      const current = sessionRef.current;
      if (!current) {
        ack(noRoom());
        return null;
      }
      if (current.room.sids[current.seat] !== socket.id) {
        ack(staleSession());
        return null;
      }
      return current;
    };

    const answerControl = (ack: Ack, current: Session, result: RoomControlResult): void => {
      ack(result.ok ? { ok: true, snapshot: current.room.snapshot(current.seat) } : result);
    };

    socket.on('room:create', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (sessionRef.current) return ack({ error: 'ALREADY_IN_ROOM' });
      const ref: { room?: Room } = {};
      const room = manager.create(sendFor(ref), opts);
      ref.room = room;
      if (!room.bind(socket.id, 0, room.tokens[0])) {
        manager.remove(room);
        return ack({ error: 'BIND_FAILED' });
      }
      enter(room, 0);
      ack({ code: room.code, seat: 0, token: room.tokens[0], snapshot: room.snapshot(0) });
    });

    socket.on('room:join', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (sessionRef.current) return ack({ error: 'ALREADY_IN_ROOM' });
      const code = typeof (raw as { code?: unknown })?.code === 'string' ? (raw as { code: string }).code.trim().toUpperCase() : '';
      const room = manager.get(code);
      if (!room) return ack({ error: 'NO_ROOM' });
      const issued = room.issueSeat1();
      if (!issued) return ack({ error: 'ROOM_FULL' });
      if (!room.bind(socket.id, 1, issued.token)) return ack({ error: 'BIND_FAILED' });
      enter(room, 1);
      ack({ code: room.code, seat: 1, token: issued.token, snapshot: room.snapshot(1) });
    });

    socket.on('room:rejoin', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      if (sessionRef.current) return ack({ error: 'ALREADY_IN_ROOM' });
      const code = typeof (raw as { code?: unknown })?.code === 'string' ? (raw as { code: string }).code.trim().toUpperCase() : '';
      const token = typeof (raw as { token?: unknown })?.token === 'string' ? (raw as { token: string }).token : '';
      const room = manager.get(code);
      if (!room) return ack({ error: 'NO_ROOM' });
      const seat = room.seatByToken(token);
      if (seat == null) return ack({ error: 'BAD_TOKEN' });
      if (!room.bind(socket.id, seat, token)) return ack({ error: 'BIND_FAILED' });
      enter(room, seat);
      ack({ code: room.code, seat, token, snapshot: room.snapshot(seat) });
    });

    socket.on('room:info', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      ack({ ok: true, snapshot: current.room.snapshot(current.seat) });
    });

    socket.on('room:start', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      answerControl(ack, current, current.room.start(current.seat, socket.id));
    });

    socket.on('room:rematch', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      answerControl(ack, current, current.room.rematch(current.seat, socket.id));
    });

    socket.on('room:leave', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      const result = current.room.leavePlayer(current.seat, socket.id);
      if (!result.ok) return ack(result);
      socket.leave(`room:${current.room.code}`);
      sessionRef.current = null;
      socket.emit('room:closed', { code: current.room.code, reason: 'left' });
      ack({ ok: true, snapshot: null });
    });

    socket.on('room:dissolve', (ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      const { room } = current;
      const memberSids = [...room.sids];
      const result = room.dissolve(current.seat, socket.id);
      if (!result.ok) return ack(result);
      manager.remove(room);
      for (const sid of memberSids) {
        if (!sid) continue;
        const target = io.sockets.sockets.get(sid);
        const targetSession = sessions.get(sid);
        if (targetSession?.current?.room === room) targetSession.current = null;
        target?.leave(`room:${room.code}`);
        io.to(sid).emit('room:closed', { code: room.code, reason: 'dissolved' });
      }
      ack({ ok: true, snapshot: null });
    });

    socket.on('action', (raw: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return;
      const current = member(ack);
      if (!current) return;
      ack(current.room.action(current.seat, raw));
    });

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
      const current = sessionRef.current;
      sessionRef.current = null;
      if (!current) return;
      current.room.unbind(socket.id);
      manager.sweep();
    });
  });
}
