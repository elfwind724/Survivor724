# 文档优先级与冲突裁决

## 现行有效顺序

1. 根目录 `AGENTS.md`
2. `docs/01` 到 `docs/11`
3. `docs/web-brief/`（网页版摘录，不能覆盖完整仓规则）
4. `docs/source/dawn_bastion_gameplay_design_v2.md`（原文备份）

冲突时以上方为准。不要同时执行互相矛盾的旧策划。

## 目录含义

| 目录 | 地位 |
|---|---|
| `src/` | 当前正式代码 |
| `docs/` | 当前有效规则 |
| `reference/` | 只读参考，不代表当前架构 |
| `archive/` | 已废弃，禁止采用 |

## 明确无效的来源

- `/Volumes/ORICO/Codex-deepseek/survival-highway` 的玩法、Manager 架构和公路循环
- Godot《永远的避难所》的 2D 剖面经营、生命日志和 Android 路线
- Phaser `webgame` 与 React《最后的营地》
- 未整理聊天记录、旧版互相矛盾的策划案

可以说「参考某个已评级的输入或加载实现」。
不可以说「参考旧项目架构」。

## 已裁决的冲突

### 里程碑编号

口头「M0 架构骨架 + M1 NPC 工作闭环」对应 GDD 的 **M0**。

本仓库一律使用 GDD 编号：

- M0：纯模拟 + NPC 真实工作闭环
- M1：主世界、基地路径、蓝图建造
- M2 及以后：见 `docs/11-milestones.md`

### Rapier

`package.json` 已锁定 `@dimforge/rapier3d-compat`。
M0 和 M1 不得 import。只留给玩家、少量关键刚体和必要碰撞。

### 旧 Three.js 模块

`reference/legacy-threejs/` 里每个文件都有评级。
禁止复制 `Game.ts` 的 Manager 总线，禁止把 Mesh 当作游戏状态。

### 网页 brief 编号

`docs/web-brief/03-survivor-ai.md` 对应完整仓 `docs/03-survivor-system.md`。
`docs/web-brief/04-technical-architecture.md` 对应 `docs/10-technical-architecture.md`。
以完整仓编号为准。
