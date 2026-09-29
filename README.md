# mj-dual · 两人两杠起胡麻将（定花清一色版）

双人实时联机麻将。规则与架构基准见 [docs/](docs/)：

- [rules-v1.3.md](docs/rules-v1.3.md) — 规则 V1.3 修订版（引擎实现依据）
- [architecture-v1.2.md](docs/architecture-v1.2.md) — 联机版技术架构 V1.2（开发基准）

## 规则速览

- 筒/条两门共 72 张，2 人对弈；庄家开局定花，双方各持一门，交换后不足用异花垫、超出留闲家
- 异花废牌可打出（是碰/杠/点炮的唯一来源），但碰/杠/胡只能用本家花色
- 每次杠后从牌墙补 1 张；**两杠起胡**：杠数 ≥ 2 才有胡牌资格
- 胡牌统一公式：`4组 + 1对`（杠/碰各算一组），`手牌 + 胡牌张 = (4 − 杠 − 碰)组 + 1对`
- 碰不计杠数、补杠立即计入；无吃、无抢杠；牌墙摸完或杠后无法补牌即流局，庄家连庄

## 本地试玩（人机对战）

无需任何服务端，浏览器直接驱动规则引擎与 AI 对手：

```bash
npm run demo          # 或 cd packages/engine && npm run demo
# 打开 http://localhost:8787
```

- 你执座位 0，只看得到自己的手牌；AI 执座位 1（贪心策略：能胡就胡、能杠就杠、能碰就碰，出牌保花色搭子）
- 点击手牌出牌，碰/杠/胡/过用金色按钮；流局或胡牌后点「下一局」连续对局，战绩自动累计
- 牌面为纯 SVG 绘制（筒=蓝圈、条=绿竹），音效为 WebAudio 合成，右上角可静音/查看对局记录

## 联机对战（真实双端）

```bash
npm run server        # 启动联机服务端（同源托管前端）
# 双方各自打开 http://localhost:8788（局域网内用本机 IP）
# 一人点「联机 → 创建房间」，另一人输入 4 位房间号加入
```

- **服务端权威**：牌局状态只在服务端，客户端只发意图（不含座位，座位由连接身份绑定）
- **按玩家视角过滤**：对手手牌/牌墙只发数量，摸牌张只有本人可见，结算才亮牌（`PlayerView`）
- **超时托管**：行动超时（默认 20s，`MJ_AUTO_MS` 可调）或玩家掉线（4s）自动代打建议牌
- **断线重连**：页面刷新/重连凭 `sessionStorage` 中的 token 自动回到对局
- 房间纯内存态，双端断开 10 分钟后自动回收

## 结构

```
packages/engine   纯函数规则引擎（零运行时依赖）
├── src/tile.ts          牌定义（72 张）
├── src/rng.ts           可注入随机源
├── src/rng.node.ts      服务端 CSPRNG（node:crypto，生产用）
├── src/deal.ts          洗牌发牌（庄14/闲13/墙45）
├── src/changeFlower.ts  定花交换三情况 + 托管建议
├── src/hu.ts            胡牌判定（4组+1对 分解）
├── src/ting.ts          听牌枚举
├── src/claims.ts        碰/杠/胡 响应评估（含过张）
├── src/settlement.ts    结算与下一局
├── src/validator.ts     72张守恒 + 阶段不变量断言
├── src/engine.ts        reducer：(state, action, rng) → (state, events)
├── src/suggest.ts       托管/建议策略（本地 AI 与服务端共用）
├── src/view.ts          PlayerView 按玩家视角过滤（服务端下发契约）
├── src/sim.ts           随机自对弈模拟器
└── demo/                游戏前端（本地 AI + 联机客户端，esbuild 打包）

packages/server   联机服务端（阶段二首版）
├── src/rooms.ts         房间/座位绑定/超时托管/token 重连
├── src/gateway.ts       Socket.IO 协议（room:create/join/rejoin、action、state）
└── src/index.ts         HTTP 静态托管前端 + 网关装配
```

## 开发

```bash
npm install
npm test                # 全 workspace 测试（引擎 41 + 服务端 7）
npm run sim             # 随机自对弈模拟 + 守恒断言
npm run demo            # 本地人机对战（8787）
npm run server          # 联机服务端（8788）
```

引擎为纯函数设计，随机性全部由注入的 `RNG` 决定（服务端接 `rng.node.ts` 的 cryptoRng，测试/模拟用 mulberry32 种子复现——种子生成器不得用于生产，详见架构文档五「随机源与座位绑定」）。
后续阶段：`packages/server`（Socket.IO 房间/超时/重连）、`apps/web`（Vue3 PWA）。
