# 技术架构

Vite + TypeScript strict + Vanilla Three.js + DOM HUD。

模拟层是唯一状态来源。Three.js 只显示。固定 30Hz 模拟。资源、NPC、建筑都不许活在 Mesh 上。

依赖版本必须与根目录 `package.json` 一致，不要自行升级。

Rapier 已安装但当前里程碑禁止使用。
