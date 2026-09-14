# Aether Model D — 多 AI 实现对比

网页 3D 复古模拟合成器(Three.js 渲染 + Web Audio API 发声)由多个 AI 各自独立实现,放在不同子目录里便于横向对比。每个子项目完全独立,互不共享依赖。

## 目录结构

| 目录 | 说明 |
|---|---|
| `deepseek-v4.1-flash/` | DeepSeek v4.1 Flash 的实现(含 vitest 测试) |
| `glm-5.3/` | GLM-5.3 的实现(含 vitest 测试) |
| `hy4-preview/` | hy4-preview 的实现(含 Playwright 自检脚本) |

## 在线预览

**<https://suulnnka.github.io/aether-model-d-synth/>** — 落地页可进入三个子项目。

## 安装与启动

每个子项目都是独立的 Vite + TypeScript 项目,进入对应目录后执行:

```bash
cd <子项目目录>    # 例如 cd glm-5.3
npm install        # 安装依赖
npm run dev        # 启动开发服务器,默认 http://localhost:5173
```

其他常用命令(三个子项目一致):

```bash
npm run build      # 类型检查 + 生产构建(输出到 dist/)
npm run preview    # 本地预览生产构建
```

测试:

```bash
npm test           # deepseek-v4.1-flash / glm-5.3 有 vitest 单元测试
```

## 注意事项

- 三个子项目默认都用 5173 端口;同时启动多个时 Vite 会自动顺延到 5174、5175……以终端里实际打印的地址为准。
- 浏览器要求音频由用户手势触发:打开页面后点击任意位置才能出声。

## GitHub Pages 部署

push 到 `master` 时由 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) 自动安装并构建三个子项目,连同根目录落地页一起发布到 GitHub Pages,各子项目分别位于 `/<子项目>/` 路径下。

