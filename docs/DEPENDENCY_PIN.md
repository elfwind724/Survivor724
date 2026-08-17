# 依赖钉死说明

`package.json` 中所有版本都是精确版本，没有 `^` 或 `~`。

| 包 | 版本 | 说明 |
|---|---|---|
| three | 0.185.1 | 当前稳定 r185 |
| @types/three | 0.185.4 | 与 r185 对齐 |
| @dimforge/rapier3d-compat | 0.20.0 | 已安装，M0/M1 禁止 import |
| typescript | 5.9.3 | 使用 5.x 稳定版，不用 TS 7 |
| vite | 7.1.5 | 与 vitest 3 对齐 |
| vitest | 3.2.4 | 节点测试环境 |
| @types/node | 24.13.2 | 仅给 vite 配置使用 |

升级必须单独批准，并同时更新 lockfile。
