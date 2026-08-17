# 参考资料

本目录仅供阅读。禁止把旧架构复制进 `src/`。只有经过评估、确认适合 Dawn Bastion 分层的模块才能迁移。

这里不是当前项目架构。当前架构以 `docs/10-technical-architecture.md` 和 `src/` 为准。

## 禁止整仓采用的旧项目

`/Volumes/ORICO/Codex-deepseek/survival-highway`（《末日公路：生存远征》）是另一款游戏：公路移动、车辆、滚动世界、Manager 总线。

明确不要迁移：

- `src/core/Game.ts` 及其 Manager 注册表
- 车辆、公路生成、公路尸潮、副本波次
- 旧敌人 AI 和角色控制器
- 旧存档字段和公路 HUD
- `node_modules`、`dist`、GLB、音频

## 已筛选文件评级

| 路径 | 评级 | 可以学什么 | 不能学什么 |
|---|---|---|---|
| `legacy-threejs/input/InputSystem.ts` | 可参考接口 | 按帧键盘鼠标状态 | 全局单例 `export const input` |
| `legacy-threejs/event-bus/EventBus.ts` | 可参考模式 | 类型化订阅/广播 | 公路游戏那张事件表 |
| `legacy-threejs/gltf-loader/ModelLibrary.ts` | 可参考加载 | GLB 原型缓存、骨骼克隆、Instanced 预处理 | 公路资产表和路径 |
| `legacy-threejs/camera/CameraManager.ts` | 只看手法 | lerp、shake | 车内/引擎盖/公路机位 |
| `legacy-threejs/save-system/SaveSystem.ts` | 只看版本号 | `version` 与迁移意识 | 车辆、饥饿、车厢 schema |
| `legacy-threejs/instancing/InstancedPool.excerpt.ts` | 可参考容量回收 | 固定容量、slot 回收 | 整份滚动世界 `WorldManager` |

迁移前必须先改造成：不依赖 Mesh 保存规则、不依赖旧 `game` 单例、能通过本仓库的类型检查。
