# Design Tools Suite（Figma 小工具合集）

本工程是一个可扩展的 Figma 插件项目，提供工具注册机制，并内置「同步到 CMS」工具：导出选中节点/当前页素材并调用现有 CMS 接口导入。

## 目录结构

- `manifest.json`：Figma 插件清单
- `src/plugin/code.ts`：插件主线程（读取选区、导出 PNG、与 UI 通信）
- `src/tools/registry.ts`：工具注册表（新增工具只改这里）
- `src/tools/syncToCms/*`：同步到 CMS 工具实现

## 开发与构建

安装依赖：

```bash
npm install
```

构建（生成 `dist/index.html` + `dist/code.js`）：

```bash
npm run build
```

类型检查与 lint：

```bash
npm run check
npm run lint
```

## 在 Figma 中加载本地插件

1) **务必先构建**：在本目录执行 `npm install` 与 `npm run build`，确保生成 `dist/code.js` 与 `dist/index.html`（仅选 `manifest` 但缺少 `dist` 会导致 **插件导入失败**）。
2) 使用 **Figma 桌面版**（macOS/Windows 客户端）。**网页版 Figma 无法可靠加载本地 manifest 开发插件**，若只在浏览器里用会看到导入失败或无法调试。
3) Figma Desktop → `Plugins` → `Development` → `Import plugin from manifest...`
4) 选择本工程目录下的 **`manifest.json`**（路径：`kv-platform/figma-tools-plugin/manifest.json`）。
5) 若仍失败：尽量把工程放在**无空格、无中文**的路径下再试（少数环境对路径敏感）。

### 插件导入失败排查清单

| 现象 | 处理 |
|------|------|
| 提示找不到 `code.js` / `index.html` | 在本目录执行 `npm run build` |
| 浏览器里用 Figma | 换 **桌面客户端** 再导入 |
| 路径含空格 / 特殊字符 | 复制到如 `~/dev/figma-tools-plugin` 再导入 |
| UI 白屏 | 已移除会向 `trae.ai` 等外域请求的构建插件；重新 `npm run build` |

## 「同步到 CMS」使用说明

1) 确保 CMS 后端可访问（默认 `http://localhost:3001`）
2) 在 Figma 中选中要导出的 Frame/Component/Instance（或选择“当前页顶层”）
3) 打开插件 → `同步到 CMS` → 点击 `导出并同步`
4) 插件会调用 CMS 的 `POST /api/figma-import` 导入数据（默认导入为未发布）

## 「KV → 头像框（分图层）」

插件内已包含**完整链路**（不依赖 CMS 入库）：

1. 在 Figma 选中一个 **Frame / Group / Component / Instance** → **读取选区**（插件主线程导出 PNG + 结构 JSON）。
2. **生成**：  
   - **本地模拟**：下拉选「本地模拟（内置）」，不发起网络请求，在插件 UI 内用 Canvas 生成占位三图层 + 合成图，用于对齐 **回写** 位置。  
   - **HTTP**：默认 `http://localhost:3004` + `POST /api/avatar-frame/generate`（契约类型：`ai-design-platform/api/contracts/avatarFrameGenerate.ts`）。在 `ai-design-platform` 运行 `npm run dev:avatar-frame-api`；未配置 Ark 时返回占位图；真 AI 需 `ARK_API_KEY` 等。服务端在 Ark 出图后默认调用 **`rmbg-local-server`**（`http://127.0.0.1:8765/cutout`）抠图，与本工具 ComfyUI 无关。旧版假服务：`figma-tools-plugin` 下 `npm run dev:avatarframe-api`（3010）。
3. **回写为分图层 Frame**：在主文件画布上创建 270×270 的 Frame，内含三个元素矩形 + 半透明合成参考层（见 `src/plugin/code.ts` 中 `createAvatarFrame`）。

若 HTTP 模式下合成预览异常，请确认生成接口返回的图层与 `spec.boxes`（270 坐标系）一致；`dev-server/avatarframe-api.mjs` 已按 `figmaFrame`→`targetFrame` 比例缩放合成画布。

## 备注

- 网络访问域名目前在 `manifest.json` 的 `networkAccess.allowedDomains` 中限制为本地 CMS；如需指向测试/生产环境，需要同步加入域名。开发模式下已允许 `localhost:3001`、`3004`、`3010` 等（见 `devAllowedDomains`）。
