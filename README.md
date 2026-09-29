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

## 结构（阶段一）

```
packages/engine   纯函数规则引擎（零运行时依赖）
├── src/tile.ts          牌定义（72 张）
├── src/rng.ts           可注入随机源
├── src/deal.ts          洗牌发牌（庄14/闲13/墙45）
├── src/changeFlower.ts  定花交换三情况 + 托管建议
├── src/hu.ts            胡牌判定（4组+1对 分解）
├── src/ting.ts          听牌枚举
├── src/claims.ts        碰/杠/胡 响应评估（含过张）
├── src/settlement.ts    结算与下一局
├── src/validator.ts     72张守恒 + 阶段不变量断言
├── src/engine.ts        reducer：(state, action, rng) → (state, events)
└── src/sim.ts           随机自对弈模拟器
```

## 开发

```bash
npm install
npm test                # vitest 单元测试
npm run sim             # 随机自对弈 2 万局 + 守恒断言
```

引擎为纯函数设计，随机性全部由注入的 `RNG` 决定（服务端接 crypto，测试用种子复现）。
后续阶段：`packages/server`（Socket.IO 房间/超时/重连）、`apps/web`（Vue3 PWA）。
