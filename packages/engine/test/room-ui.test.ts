import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '../../server/src/protocol';
import { renderRoomDialog, renderSettlementActions } from '../demo/room-ui';

const base: RoomSnapshot = {
  code: 'ABCD',
  you: 0,
  host: 0,
  phase: 'waiting',
  members: [{ connected: true }, { connected: false }],
  round: 0,
  tally: { wins: [0, 0], draws: 0 },
  view: null,
  canStart: false,
  canRematch: false,
};

function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { ...base, ...overrides };
}

describe('房间弹窗', () => {
  it('未入房时提供创建与加入房间', () => {
    const html = renderRoomDialog(null);
    expect(html).toContain('data-action="room-create"');
    expect(html).toContain('data-action="room-join"');
    expect(html).toContain('id="room-code"');
  });

  it('等待中的房主能开始游戏；按钮只由服务器快照决定', () => {
    const html = renderRoomDialog(room({ canStart: true }));
    expect(html).toContain('开始游戏');
    expect(html).toContain('data-action="room-start"');
    expect(html).toContain('解散房间');
    expect(html).not.toContain('准备');
    expect(html).not.toContain('就绪');
  });

  it('等待中的玩家只能退出，不能显示房主操作', () => {
    const html = renderRoomDialog(room({ you: 1, members: [{ connected: true }, { connected: true }] }));
    expect(html).toContain('退出房间');
    expect(html).not.toContain('开始游戏');
    expect(html).not.toContain('解散房间');
  });

  it('对局中仍允许玩家退出房间', () => {
    const html = renderRoomDialog(room({ you: 1, phase: 'playing', round: 3 }));
    expect(html).toContain('第 3 局');
    expect(html).toContain('退出房间');
  });

  it('结算时仅房主能再来一局，玩家看到等待说明并可退出', () => {
    const hostHtml = renderRoomDialog(room({ phase: 'finished', round: 4, canRematch: true }));
    expect(hostHtml).toContain('再来一局');
    expect(hostHtml).toContain('data-action="room-rematch"');

    const playerHtml = renderRoomDialog(room({ you: 1, phase: 'finished', round: 4 }));
    expect(playerHtml).toContain('等待房主再来一局');
    expect(playerHtml).toContain('退出房间');
    expect(playerHtml).not.toContain('data-action="room-rematch"');
  });

  it('房间码和错误提示按文本转义渲染', () => {
    const html = renderRoomDialog(room({ code: '<img src=x onerror=alert(1)>' }), '<script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('人机结算只显示再来一局，不显示准备流程', () => {
    const html = renderSettlementActions('local');
    expect(html).toContain('data-action="local-rematch"');
    expect(html).toContain('再来一局');
    expect(html).not.toContain('准备');
    expect(html).not.toContain('就绪');
  });

  it('联机结算只允许房主再来一局，玩家等待房主', () => {
    const host = renderSettlementActions('host', false);
    expect(host).toContain('data-action="room-rematch"');
    expect(host).toContain('disabled');

    const player = renderSettlementActions('player');
    expect(player).toContain('等待房主再来一局');
    expect(player).not.toContain('data-action="room-rematch"');
  });
});
