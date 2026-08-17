# Dawn Bastion / 黎明据点

3D 俯视生存游戏：活体幸存者模拟、基地建设、白天真实外勤、副本内外同步，以及夜间防区指挥。

本仓库是独立项目，不是《末日公路：生存远征》的续作。旧 Three.js 公路项目只允许出现在 `reference/legacy-threejs/`，且仅供阅读。

## 位置

- 工作副本：`/Volumes/ORICO/dawn-bastion`
- GitHub：https://github.com/elfwind724/Survivor724
- 开始前必须挂载 ORICO。不要把 `node_modules` 或仓库拷到 Mac 主盘。

## 给 Grok Build CLI

```bash
cd /Volumes/ORICO/dawn-bastion
grok
```

然后只读，不立即改代码：

```text
先完整阅读 AGENTS.md 和 docs 目录。
检查 package.json、src 目录与 reference 目录。
reference 目录只作为技术参考，不代表当前项目架构。

现在进入计划阶段：
1. 总结你对游戏核心玩法的理解。
2. 指出文档之间可能存在的冲突。
3. 设计模拟层、渲染层、AI层、UI层和存档层边界。
4. 给出当前里程碑的文件结构与验收标准。
5. 不要创建或修改任何代码，等待计划批准。
```

## 给网页版 Build Mode

不要只丢一个 GitHub 链接。使用 `docs/web-brief/` 里的精简包：

- `AGENTS.md`
- `01-game-vision.md`
- `02-core-gameplay-loop.md`
- `03-survivor-ai.md`
- `04-technical-architecture.md`
- `05-current-milestone.md`
- 根目录 `package.json`
- `reference/` 中 2–5 个已评级文件，不要整仓

## 命令

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

依赖版本已钉死，不要改成 `^` 或 `~`。

## 目录

| 路径 | 含义 |
|---|---|
| `src/` | 当前正式代码 |
| `docs/` | 当前有效规则 |
| `docs/source/` | 完整设计原文，只读 |
| `docs/web-brief/` | 网页 Build Mode 摘录 |
| `reference/` | 只读参考，禁止整仓复制旧架构 |
| `archive/` | 已废弃，禁止采用 |

当前只允许 GDD M0。详见 `AGENTS.md` 和 `docs/11-milestones.md`。
