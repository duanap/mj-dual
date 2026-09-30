import type { RoomSnapshot } from '../../server/src/protocol';

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const phaseLabel = (phase: RoomSnapshot['phase']): string => {
  switch (phase) {
    case 'waiting': return '等待开始';
    case 'playing': return '对局中';
    case 'finished': return '本局已结束';
  }
};

function button(action: string, label: string, disabled = false, className = ''): string {
  return `<button type="button" class="abtn ${escapeHtml(className)}" data-action="${escapeHtml(action)}"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>`;
}

export function renderRoomDialog(snapshot: RoomSnapshot | null, error?: string): string {
  const errorHtml = error ? `<p class="room-error" role="alert">${escapeHtml(error)}</p>` : '';
  if (!snapshot) {
    return `<section class="room-panel" aria-labelledby="room-title">
      <h2 id="room-title">房间</h2>
      <p class="room-copy">创建房间邀请好友，或输入房间号加入。</p>
      ${errorHtml}
      <div class="room-actions">${button('room-create', '创建房间')}</div>
      <form class="joinrow" data-form="room-join">
        <label class="sr-only" for="room-code">房间号</label>
        <input id="room-code" name="code" maxlength="8" autocomplete="off" placeholder="输入房间号" aria-label="房间号">
        ${button('room-join', '加入房间')}
      </form>
    </section>`;
  }

  const isHost = snapshot.you === snapshot.host;
  const memberName = (seat: 0 | 1): string => seat === snapshot.host ? '房主' : '玩家';
  const members = snapshot.members.map((member, seat) => `<li class="room-member">
    <span>${memberName(seat as 0 | 1)}${snapshot.you === seat ? '（你）' : ''}</span>
    <span class="room-presence ${member.connected ? 'online' : 'offline'}">${member.connected ? '在线' : seat === 1 ? '等待加入' : '离线'}</span>
  </li>`).join('');
  const stats = snapshot.round > 0
    ? `<p class="room-stats">第 ${snapshot.round} 局 · 房主胜 ${snapshot.tally.wins[0]} · 玩家胜 ${snapshot.tally.wins[1]} · 流局 ${snapshot.tally.draws}</p>`
    : '<p class="room-stats">尚未开始</p>';
  let controls = '';
  if (isHost) {
    if (snapshot.phase === 'waiting') controls += button('room-start', '开始游戏', !snapshot.canStart, 'primary');
    if (snapshot.phase === 'finished') controls += button('room-rematch', '再来一局', !snapshot.canRematch, 'primary');
    controls += button('room-dissolve', '解散房间', false, 'danger');
  } else {
    if (snapshot.phase === 'finished') controls += '<p class="room-waiting">等待房主再来一局</p>';
    controls += button('room-leave', '退出房间', false, 'secondary');
  }

  return `<section class="room-panel" aria-labelledby="room-title">
    <h2 id="room-title">房间 <span class="room-code">${escapeHtml(snapshot.code)}</span></h2>
    <p class="room-phase">${escapeHtml(phaseLabel(snapshot.phase))}</p>
    <ul class="room-members">${members}</ul>
    ${stats}
    ${errorHtml}
    <div class="room-actions">${controls}</div>
  </section>`;
}

export type SettlementActor = 'local' | 'host' | 'player';

export function renderSettlementActions(actor: SettlementActor, canRematch = true): string {
  if (actor === 'local') return button('local-rematch', '再来一局', false, 'primary');
  if (actor === 'host') return button('room-rematch', '再来一局', !canRematch, 'primary');
  return '<p class="room-waiting">等待房主再来一局</p>';
}
