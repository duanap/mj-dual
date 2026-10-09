# 手机全屏麻将与房间管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `mj.duanap.cn` 升级为铺满手机可用屏幕的横向麻将游戏，并实现房主控制的房间生命周期、终局亮牌、统一弹窗与牌局特效。

**Architecture:** 保留原生 TypeScript、纯函数规则引擎与 Socket.IO。服务端作为房间和角色权限的唯一依据，给两个客户端发送不含 token 的房间快照与各自私有牌局视图；前端按同一快照渲染房间弹窗和牌桌。结算继续使用规则引擎的既有下一局推进，不再向玩家展示准备流程。

**Tech Stack:** TypeScript, Node.js >=20, Socket.IO, Vitest, esbuild, CSS、HTML 和项目现有 SVG/PNG 资源。

**Spec:** `docs/superpowers/specs/2026-09-30-fullscreen-rooms-design.md`

## Global Constraints

- 每位玩家只能获得本人手牌、本人合法操作、匿名化的对手暗杠及结算视图。
- 房主身份固定为房间创建者的服务端连接，独立于庄家、结算输赢和客户端自报座位。
- 产品流程不包含准备按钮或等待双方准备；只有房主开始和房主再来一局。
- 背景原图 SHA256 为 `fe18606584f11b0807519806bc9e464f3eb0ab7411282ab405ebd6201cef14be`；不得改动图像内容。
- 手机固定横向排版；仅用 CSS 旋转界面，不调用全屏或屏幕方向权限。
- 两门九张 SVG 牌面、两杠起胡、庄家与胜负统计规则保持原有含义。
- 不增加登录、数据库、付费服务或前端框架；生产应用仅监听 `127.0.0.1:8788`。
- 生产切换前确认房间为空；应用状态只存内存，服务升级会关闭当前房间。
- 不改动现有 EdgeOne 规则、其它域名或 Nginx 全局配置；保留已验证的源站 `no-store`。
- 验证使用 `npm test`、类型检查与前后端构建；不新增 CI。

---

## File Map

- `packages/server/src/protocol.ts` — 房间快照、房间阶段、角色和控制操作的共享序列化类型。
- `packages/server/src/rooms.ts` — 等待大厅、房主权限、开始、主动退出、解散、再开与托管计时。
- `packages/server/src/gateway.ts` — 新房间事件、会话版本与 Socket.IO 权限检查。
- `packages/server/test/rooms.test.ts`、`packages/server/test/gateway.test.ts` — 房间状态及真实双客户端协议测试。
- `packages/engine/src/view.ts` — 对外牌局视图继续过滤对手暗杠及其事件牌面。
- `packages/engine/test/view.test.ts` — 暗杠牌面与事件的玩家视角测试。
- `packages/engine/demo/main.ts` — 全屏入口、统一弹窗状态、房间事件和牌桌渲染。
- `packages/engine/demo/room-ui.ts` — 房间弹窗 HTML/状态映射和角色按钮显示。
- `packages/engine/demo/effects.ts` — 按对局事件选择一次性视觉特效。
- `packages/engine/demo/index.html` — 用户背景、全屏手机布局、弹窗和特效动画。
- `packages/engine/demo/assets/background-fe186065.png` — 原始背景图片副本。
- `packages/engine/package.json` — 本地试玩和生产构建共用的 demo bundle 命令。
- `packages/server/src/index.ts` — 生产 HTTP 静态 MIME 类型及现有健康检查入口。
- `README.md` — 房间操作、全屏、结算与本地启动说明。

---

## Review Focus

下面五类输入是最可能影响玩家预期的边界，每项都在所属任务中加入测试：

1. 座位 0/1 对控制事件的伪造、旧连接及旧协议重连：仅当前绑定的房主连接可开始、重开或解散。
2. 空位房间、玩家主动退出与网络暂时断开：前者释放并撤销旧玩家 token；后者仍保留重连座位并按原托管规则推进。
3. 结算时重复点击、快速提交及对手掉线：一次重开只产生一局，结算不再超时自动前进。
4. 14 张牌、0 号一筒、被选中牌、长房间码及 568×320/667×375/844×390 视口：手牌与按钮不重叠，输入不会被重绘清空。
5. 暗杠、结算亮牌、连续重连和同一事件多次渲染：不得提前泄露对手牌面或重复播放终局特效。

---

### Task 1: 房间大厅状态与角色控制

**Files:**
- Create: `packages/server/src/protocol.ts`
- Modify: `packages/server/src/rooms.ts`
- Test: `packages/server/test/rooms.test.ts`

**Interfaces:**
- `RoomPhase = 'waiting' | 'playing' | 'finished'`
- `RoomSnapshot` 包含 `code`、`you`、`host: 0`、`phase`、两个成员的 `connected`、`round`、`tally`、`view: RoomGameView | null`、`canStart` 和 `canRematch`。成员快照不得包含 token 或牌墙。
- `RoomGameView = Omit<PlayerView, 'ready'>`；`PlayerView` 的游戏视角继续匿名化对手暗杠和暗杠事件。
- `Room.start(seat, sid)`、`Room.leavePlayer(seat, sid)`、`Room.dissolve(seat, sid)`、`Room.rematch(seat, sid)` 返回带稳定错误码的成功/失败结果。每个方法自行验证座位与当前 `sid` 绑定。
- 等待加入期间 `Room.state` 不产生牌局；房主开始时才调用 `newMatch(rng)`。结算阶段房间托管计时器停止。

- [ ] **Step 1: Write the failing tests**

在 `rooms.test.ts` 增加用例：创建时状态为 `waiting` 且 `view === null`；人数不足、玩家席位、伪造座位和旧 `sid` 均不能开始；两个成员在线后当前房主开始一次并进入定花；玩家退出后旧 token 不能重连、席位可释放；非房主不能解散；结算阶段没有托管自动再开。

- [ ] **Step 2: Run the room tests and verify they fail**

Run: `npm --workspace @mj/server test -- test/rooms.test.ts`  
Expected: 新增测试失败，当前实现创建即发牌，且没有房间控制方法。

- [ ] **Step 3: Add private room state and role-checked controls**

在 `rooms.ts` 将牌局改为可空的私有内部状态，并添加 `snapshot(seat): RoomSnapshot`、房主控制和玩家退出。等待阶段不发牌；`start` 必须核验创建者 `seat === 0`、当前绑定 `sid` 和两个在线成员。玩家退出撤销其 token 并释放席位；断线仍走原有重连/托管逻辑。`dissolve` 仅当前房主连接可执行。

- [ ] **Step 4: Run the room tests and verify they pass**

Run: `npm --workspace @mj/server test -- test/rooms.test.ts`  
Expected: 新增大厅、权限、退出和结算停表用例通过；原有超时托管与重连用例仍通过。

- [ ] **Step 5: Commit the server room model**

```bash
git add packages/server/src/protocol.ts packages/server/src/rooms.ts packages/server/test/rooms.test.ts packages/engine/src/view.ts packages/engine/test/view.test.ts
git commit -m "feat: model host-controlled room lifecycle"
```

---

### Task 2: Socket.IO 房间协议及权限边界

**Files:**
- Modify: `packages/server/src/gateway.ts`
- Test: `packages/server/test/gateway.test.ts`

**Interfaces:**
- `room:create`、`room:join`、`room:rejoin` ACK 返回原有 `{ code, seat, token }` 加当前席位的 `RoomSnapshot`；快照更新通过 `room:snapshot` 发送。
- 新增 ACK 事件 `room:info`、`room:start`、`room:leave`、`room:dissolve`、`room:rematch`。仅房间成员可读取快照，只有房主可开始/解散/重开，只有座位 1 可主动退出。
- `room:closed` 通知两端清理本地房间会话；所有控制事件都从服务端 session 和当前 `sid` 取角色。
- 新客户端在 `socket.handshake.auth` 发送 `protocol: 2`；旧版本连接收到明确刷新提示。旧协议不能借用 `ready` 或其它事件触发下一局。

- [ ] **Step 1: Write failing two-client lifecycle tests**

改造 `gateway.test.ts` 的连接 helper，携带协议版本。测试“建房返回等待快照”“游戏未开始时操作被拒”“创建者开始后双方收到定花视图”“玩家退出后房主席位保留”“伪造房主的玩家开始/解散/重开均被拒”“旧协议收到刷新提示”“结算快照不自动推进”。

- [ ] **Step 2: Run the gateway tests and verify they fail**

Run: `npm --workspace @mj/server test -- test/gateway.test.ts`  
Expected: 缺少的新事件/房间快照断言失败；旧实现创建房间即对局。

- [ ] **Step 3: Implement the authenticated room gateway**

在 `gateway.ts` 添加协议版本握手检查与上述房间事件。控制 ACK 先检查 socket 仍绑定对应席位，再调用 Task 1 的 Room 方法。ACK 和 `room:snapshot` 只发送按席位过滤的视图。游戏终局后只发布结束状态，不调用 `ready`；结算期间托管不再自动开始下一局。

- [ ] **Step 4: Run the gateway tests and verify they pass**

Run: `npm --workspace @mj/server test -- test/gateway.test.ts`  
Expected: 两客户端创建、开始、权限拒绝、退出及旧协议刷新提示通过；重连和手牌视角过滤仍通过。

- [ ] **Step 5: Commit the authenticated gateway**

```bash
git add packages/server/src/gateway.ts packages/server/test/gateway.test.ts
git commit -m "feat: add authenticated room control events"
```

---

### Task 3: 全屏背景与稳定弹窗界面

**Files:**
- Modify: `packages/engine/demo/index.html`
- Modify: `packages/engine/demo/main.ts`
- Create: `packages/engine/demo/room-ui.ts`
- Create: `packages/engine/demo/assets/background-fe186065.png`
- Modify: `packages/engine/package.json`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/engine/demo/server.mjs`
- Test: `packages/engine/test/room-ui.test.ts`

**Interfaces:**
- `room-ui.ts` 导出 `renderRoomDialog(snapshot: RoomSnapshot | null, error?: string): string`；房间角色、状态文案与按钮完全由服务器快照导出值决定。
- 主页面持有一个 `ModalKind | null`，取值仅为房间、牌河、记录、结算；关闭弹窗不会发送 Socket.IO 房间/对局事件。
- 生产和本地静态服务器均用 `image/png` 提供 `/assets/background-fe186065.png`。

- [ ] **Step 1: Write room-dialog rendering tests**

在 `room-ui.test.ts` 覆盖：未入房显示创建/加入；房主大厅有“开始游戏”但没有“准备”；玩家大厅有“退出房间”但没有开始/解散；玩家退出中和结算阶段显示各自允许的动作；房间码错误信息显示为文本而非 HTML。

- [ ] **Step 2: Run the dialog tests and verify they fail**

Run: `npm --workspace @mj/engine test -- test/room-ui.test.ts`  
Expected: `renderRoomDialog` 不存在。

- [ ] **Step 3: Copy the original background and add full-screen viewport layout**

从用户提供的 PNG 原样复制为 `assets/background-fe186065.png`，校验 SHA256 与设计一致。去掉 `#app` 的宽度上限和牌桌卡片外框，将背景用 `cover` 铺满游戏容器；按现有 100dvh/100dvw 横屏变换保持竖屏 CSS 旋转和安全区映射。`index.html` 视口保留 `viewport-fit=cover`，不调用浏览器方向/全屏权限 API。

- [ ] **Step 4: Render one accessible role-aware room modal**

在 `room-ui.ts` 实现接口并渲染房间号、本人角色、双方在线状态、房间阶段、局数/战绩与有效操作。`main.ts` 删除 `menuOpen` 的旧联机弹窗判断，改用一个 ModalKind；接入 Task 2 快照和事件；保留房间号输入草稿/光标；房主创建后或玩家加入后打开房间弹窗；“开始游戏”成功后自动关闭。将带 SVG data URL loader 的 esbuild 命令拆为 `packages/engine` 的 `build:demo`，本地试玩和生产 server 共用同一前端构建。

- [ ] **Step 5: Make every modal close safely**

房间、完整牌河、记录、结算共用遮罩点击、右上角关闭按钮与 Esc。只在 `event.target === event.currentTarget` 时视为空白点击；弹窗内部交互不关闭；关闭结算不清除亮牌；关闭房间弹窗不等于退出或解散。

- [ ] **Step 6: Verify room-dialog tests and demo compilation**

Run: `npm --workspace @mj/engine test -- test/room-ui.test.ts`  
Run: `npm --workspace @mj/engine run typecheck:demo`  
Run: `npm --workspace @mj/engine run build:demo`  
Expected: 房主/玩家权限按钮正确；默认横屏、竖屏 CSS 旋转、弹窗 JSX/HTML 与 typecheck 正常。

- [ ] **Step 7: Commit the full-screen room UI**

```bash
git add packages/engine/demo/index.html packages/engine/demo/main.ts packages/engine/demo/room-ui.ts packages/engine/demo/assets/background-fe186065.png packages/engine/package.json packages/server/src/index.ts packages/engine/demo/server.mjs packages/engine/test/room-ui.test.ts
git commit -m "feat: add full-screen game and room modal"
```

---

### Task 4: 房主开始、玩家退出与房主解散的客户端闭环

**Files:**
- Modify: `packages/engine/demo/main.ts`
- Test: `packages/server/test/gateway.test.ts`

**Interfaces:**
- 前端房间管理操作仅发送 `room:start`、`room:leave`、`room:dissolve` 或 `room:rematch`，不发送准备/座位字段。
- 任一 RPC 统一 ACK `{ ok: true, snapshot } | { ok: false, code, message }`；`room:closed` 仅携带房间码及关闭原因，不带 token。

- [ ] **Step 1: Write the failing guest-leave/dissolve tests**

补充网关测试：玩家主动退出后其旧 token 不能重新加入；房间回到等待人数状态且房主仍可邀请新玩家；房主解散同时通知双方、移除活动房间并拒绝其后旧 socket 发送的 action；断线与主动退出保持不同语义。

- [ ] **Step 2: Run the lifecycle integration tests and verify they fail**

Run: `npm --workspace @mj/server test -- test/gateway.test.ts`  
Expected: 当前不存在 `room:leave`/`room:dissolve` 协议和 token 撤销。

- [ ] **Step 3: Implement one-slot release and host-owned room disposal**

在 RoomManager 校验当前绑定的玩家 socket 后再释放 seat 1、旋转该席位 token 并发布新的等待快照。房主解散检查 `seat === 0` 且 SID 仍是房间的当前绑定，发送 `room:closed`、清理 socket 房间组和托管 timer，再从 Manager 删除房间。对空操作/旧连接/旧 token 返回稳定错误码。

- [ ] **Step 4: Wire room actions and errors to the UI**

玩家弹窗显示“退出房间”；房主显示“解散房间”；只有人数齐且在线时启用房主的“开始游戏”。主页面收到旧协议/房间消失时显示“页面已更新”或“房间已解散”，清掉保存的过期会话，再让用户选择返回人机或重新加入。RPC pending 时禁用重复点击；失败后只按 ACK 恢复按钮。

- [ ] **Step 5: Run gateway tests and typecheck**

Run: `npm --workspace @mj/server test -- test/gateway.test.ts`  
Run: `npm --workspace @mj/server run typecheck`  
Expected: 撤销 token/权限验证通过，游戏在玩家普通掉线后仍保留原重连托管行为。

- [ ] **Step 6: Commit room-control closure**

```bash
git add packages/engine/demo/main.ts packages/server/src/rooms.ts packages/server/src/gateway.ts packages/server/test/gateway.test.ts
git commit -m "feat: close out host-managed room controls"
```

---

### Task 5: 无准备的重开、结算亮牌与杠/胡特效

**Files:**
- Modify: `packages/engine/demo/main.ts`
- Modify: `packages/engine/demo/room-ui.ts`
- Create: `packages/engine/demo/effects.ts`
- Modify: `packages/engine/src/view.ts`
- Test: `packages/engine/test/room-ui.test.ts`
- Test: `packages/engine/test/view.test.ts`
- Test: `packages/server/test/rooms.test.ts`

**Interfaces:**
- `celebrationForEvent(event: GameEvent, viewer: Seat): GameEffect | null` 只返回事件类型、本人/对手标签与不会泄露暗杠牌面的文案；不改引擎计分/胡牌规则。
- 新一局请求使用 Task 2 的 `room:rematch`；客户端不调用并公开 ready。

- [ ] **Step 1: Write the failing round lifecycle tests**

增加测试：结算后托管超时不推进下一局；仅在线房主可以重开；玩家、旧 socket、非结算房间均不能重开；重开一次只增加一局，累计战绩保留，胡牌者下局坐庄且流局庄家连庄；人机模式玩家能一次开始下一局。

- [ ] **Step 2: Run the round-lifecycle tests and verify they fail**

Run: `npm --workspace @mj/server test -- test/rooms.test.ts`  
Expected: 现有 settlement 自动 ready 托管或无 host-only rematch 检查会触发新增断言。

- [ ] **Step 3: Implement one authenticated rematch transition**

房间已经结算时，服务器一次性沿用引擎既有下一局推进与庄家规则，不广播中间 ready/准备状态。先置 pending/角色校验，拒绝非 host、不在线、未结束和过期连接。结算停止常规自动代打；无人在线时仍按 10 分钟回收。

- [ ] **Step 4: Remove visible preparation and expose the result**

移除房间与人机结算上的准备按钮/说明及在线协议的 ready 动作；结算后保持终局。人机模式“再来一局”直进下一局；联机房主看到“再来一局”，玩家看到“等待房主”；两端都看到自己的手牌、对手手牌和完整副露。关闭结算弹窗仍在牌桌显示已揭示牌面，并保留重新打开结果的入口。

- [ ] **Step 5: Mask concealed-gang details in event views**

对玩家视图中的对手暗杠事件和副露以隐藏牌占位符替换；只在结束状态发送完整牌面。为同 seat/旧 `sid` 构造事件的测试断言其 rank 不进入对家快照。

- [ ] **Step 6: Add deterministic visual-event selection**

用 `effects.ts` 将 `gang` 映射为一次短“明杠/暗杠/补杠”提示，`hu` 映射为“自摸胡/点炮胡”，`draw_game` 映射为流局提示；不重复播放 `round_settled`。对手暗杠特效文案只包含类别，不包含牌名。`reduced-motion` 下将动效降为静态标题，时效约 1.2 秒且不拦截手牌触控。

- [ ] **Step 7: Test event filtering, labels and existing gameplay**

Run: `npm --workspace @mj/engine test -- test/view.test.ts test/room-ui.test.ts`  
Run: `npm --workspace @mj/engine run typecheck`  
Run: `npm --workspace @mj/server test -- test/rooms.test.ts`  
Expected: 正常局暗杠匿名；终局亮牌；胡/杠/流局一次提示；局数/战绩/庄家符合原规则。

- [ ] **Step 8: Commit result and effect behavior**

```bash
git add packages/engine/demo/main.ts packages/engine/demo/room-ui.ts packages/engine/demo/effects.ts packages/engine/src/view.ts packages/engine/test/room-ui.test.ts packages/engine/test/view.test.ts packages/server/src/rooms.ts packages/server/test/rooms.test.ts
git commit -m "feat: finish rounds without player readiness"
```

---

### Task 6: 全屏手机验收、服务端验证与发布

**Files:**
- Modify: `packages/engine/demo/main.ts`、`packages/engine/demo/index.html`、`packages/server/src/index.ts`、`README.md`
- Use: `packages/engine/demo/assets/background-fe186065.png`

- [ ] **Step 1: Run full unit/integration tests and static checks**

Run: `npm test`  
Run: `npm run typecheck --workspaces --if-present`  
Run: `npm run typecheck:demo --workspace @mj/engine`  
Run: `npm run build:demo --workspace @mj/engine`  
Expected: 所有旧的 62 项与本计划新测试通过；无 EngineIO/SVG 打包错误。

- [ ] **Step 2: Run local two-client room smoke test**

使用两个 Socket.IO 客户端：旧协议刷新提示；新协议创建房间/交换信息；客人加入；尝试客人开始与解散均拒绝；房主开始；两端房间弹窗关闭；一端重连恢复；结束后无自动准备；房主重开/玩家退出/房主解散分别成功；服务端健康检查返回 `{ ok:true }`。

- [ ] **Step 3: Exercise landscape/portrait presentation in the browser**

按 390×844、568×320、667×375、844×390 视口检查旋转横向界面、背景、全幅牌桌、单排手牌、其上操作区、遮罩关闭、房间加入草稿、结算亮牌、暗杠隐藏和 safe area；实际以 `getBoundingClientRect()` 检查按钮底部小于手牌顶部、页面 `scrollWidth <= innerWidth`、PNG 图片 `naturalWidth > 0`。

- [ ] **Step 4: Verify full-size PNG and foreground asset mime**

确保 `demo/server.mjs`、`packages/server/src/index.ts` 返回 `/assets/background-fe186065.png` 作为 `image/png`；请求返回图片 SHA256 `fe18606584f11b0807519806bc9e464f3eb0ab7411282ab405ebd6201cef14be`。

- [ ] **Step 5: Conduct independent code review**

审查服务端权限、房间关闭竞态、重连 token、暗杠视图、模态焦点、结算事件幂等与手机可点性；阻塞项修复后重复相关测试。

- [ ] **Step 6: Prepare deployment and rollback**

确认生产房间数为 0 后，为新 release、systemd 和 `mj.duanap.cn` 站点配置留档。仅构建/切换 `mj.duanap.cn`，保持服务监听 `127.0.0.1:8788`；不变更 EdgeOne 规则、证书、账号/数据库或其它站点。将 `NODE_ENV`、`HOST`、`PORT` 写入服务 unit，服务停止/启动只发生在允许的发布时段。

- [ ] **Step 7: Verify production and rollback route**

确认 systemd 在线、`/health` 为 200、公开首页与 JS 指纹匹配新 release、静态背景 SHA 匹配、public Socket.IO WebSocket 能真实创建/加入/开始/结算/重开、EdgeOne 不返回旧版本缓存。记录 Node 与来源提交、备份位置、Nginx 检查结果和回滚命令；未得到用户另行要求时不推送 GitHub。

- [ ] **Step 8: Commit documentation and record release**

```bash
git add README.md
git commit -m "docs: document fullscreen room controls and release"
```

---

## 完成验收记录

- 62 项已有测试 + 本计划的新增服务器/前端测试全部通过。
- 引擎、服务端、demo 类型检查及资源打包全部通过。
- 0 准备状态功能；结算卡片、房间权限和事件快照按指定身份工作。
- 四种视口下游戏铺满屏幕，按钮位于手牌上方；背景哈希和静态资源类型匹配。
- 生产房间切换在无活跃房间时完成，服务、Nginx、公共 CDN/WebSocket 全部验证。
