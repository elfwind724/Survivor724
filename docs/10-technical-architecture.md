# 10 技术架构

GDD 解决「做什么」。本文解决「不能乱成什么样」。

## 技术栈

- Vite
- TypeScript strict（`noUncheckedIndexedAccess` 已开启）
- Vanilla Three.js
- DOM/CSS HUD
- GLB/glTF 资产（M8 才系统替换，M0 用方块）
- 固定时间步模拟：30Hz 模拟，最高 60Hz 渲染插值
- Rapier 只用于玩家、少量关键刚体和必要碰撞；M0/M1 不调用
- 存档保存模拟状态，使用版本号和迁移函数

依赖版本钉死在根目录 `package.json` 和 `package-lock.json`。不要升级，不要改成 `^`。

## 分层

```text
模拟层   WorldState / Time / Entities / Jobs / Inventory / Combat numbers
AI 层    JobPlanner + 动作状态机（不要一上来做完整 GOAP）
导航层   网格 A*（幸存者）+ 流场（敌群，M5）
渲染层   Three.js 显示、动画、灯光、相机、特效
UI 层    DOM HUD 与面板
存档层   序列化模拟状态
```

硬边界：

- 游戏模拟不得依附在 Three.js Mesh 对象中
- 渲染层不是真实游戏状态来源
- NPC、敌人、建筑、资源全部由模拟层管理
- Three.js 只负责显示、动画、灯光、相机和特效
- UI 主要使用 DOM，不将复杂面板塞入 WebGL
- 所有武器、职业、建筑和敌人数据化
- 所有关键系统必须可保存和恢复

## 建议目录

```text
src/
  app/            GameApp.ts  GameLoop.ts
  simulation/     WorldState.ts  TimeSystem.ts  EntityRegistry.ts
  survivors/      Survivor.ts  Inventory 归属在人物或容器上
  jobs/           JobBoard.ts  JobPlanner.ts  DayWorkerStates.ts
  inventory/      容器、地面掉落、仓库
  render/         只读 WorldState，创建和更新视图
  ui/             DOM
  save/           SaveSchema.ts
  data/           jobs / facilities / weapons / enemies
```

M0 只建立 `app`、`simulation`、`survivors`、`jobs`、`inventory`、`render`、`ui`、`save`、`data` 的最小骨架。不要提前填满战斗、副本和夜战目录。

## NPC AI：两层

上层 `JobPlanner` 按玩家优先级、职业技能、距离、工具背包、疲劳伤势、区域危险、截止时间给任务评分。

下层白天状态机：

```text
Idle → AcquireEquipment → TravelToTarget → Work → CollectOutput
     → ReturnToBase → DepositItems → RestOrNextJob
```

异常：`Threatened` `InCombat` `Retreating` `WaitingForHelp` `Injured` `RouteBlocked` `ToolBroken`

夜晚状态机留给 M5，现在不要实现。

## 双层模拟

| 范围 | 频率 |
|---|---|
| 玩家附近或当前场景 | 完整路径、感知、战斗；30Hz |
| 远离镜头的 NPC | 保留位置、路线节点、速度、背包、工作进度；2–5Hz |
| 玩家在副本内 | 卸载或冻结主世界渲染；主世界低频继续；不重新抽取任务结果 |

## 性能目标（以后）

普通敌人 InstancedMesh + 对象池。子弹优先射线。远处降频。垂直切片目标：6–12 名幸存者，同屏 150–250 普通感染者。M0 不要做尸潮性能。

## 存档边界

存档保存模拟状态，不保存 Three.js 对象。必须能保存：天数时间、人物位置岗位状态装备、仓库背包、建筑耐久和工作队列、资源点储量、已侦察区域、当前任务与路径。

## 明确禁止的旧架构

不要把旧公路项目的 `Game.ts` Manager 总线搬进来。
不要让 `CameraManager`、`PlayerManager`、`VehicleManager` 成为世界中枢。
`reference/legacy-threejs` 里只有输入、事件总线、GLTF 加载和实例池值得评估。
