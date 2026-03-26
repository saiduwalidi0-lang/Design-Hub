# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

## Figma 插件：头像框生成 API（本地默认）

- 仅启动 API（端口 **3004**，与 `figma-tools-plugin` 默认 Base URL 一致）：

  ```bash
  # 在 ai-design-platform 目录：
  npm run dev:avatar-frame-api
  # 或在仓库根目录 Design-Hub：
  npm run avatar-frame-api
  ```

  使用 Cursor / VS Code 打开本仓库时，已配置 **打开工作区自动运行** 该任务（见根目录 `.vscode/tasks.json`）；若未自动启动，命令面板执行 **「Tasks: Run Task」→「Avatar Frame API」**。

- 接口：`POST http://localhost:3004/api/avatar-frame/generate`（body 需含 `kvPngDataUrl`）。请求/响应字段说明见源码 `api/contracts/avatarFrameGenerate.ts`（与 Figma 插件 `KvToAvatarFramePage` 对齐）。
- **Ark 配置**（图生图与官方 `POST …/api/v3/images/generations` 对齐）：`.env` / `.env.local` 里通常只设 **`ARK_API_KEY`** 即可；未配置时 **图生图** 会使用代码内默认：`doubao-seedream-5-0-260128`、`size=2K`、`response_format=url`、北京 `api/v3` 等（见 `api/services/arkImageProvider.ts`）。需要换模型或尺寸时再设 `ARK_MODEL`、`ARK_I2I_SIZE` 等；仍兼容 `ARK_I2I_*` / `ARK_IMAGE_*`。
- **未配置** Ark 时，开发环境自动返回占位图层；`NODE_ENV=production` 且无 Ark 时返回 `ark_i2i_not_configured`。
- **抠图（仅 RMBG）**：Ark 三张出图后，默认调用根目录 **`rmbg-local-server`**（`POST /cutout`，默认 `http://127.0.0.1:8765`）。可用 `RMBG_LOCAL_URL` / `RMBG_LOCAL_SERVER` 覆盖。不需要 ComfyUI。若需跳过抠图（调试）：`AVATARFRAME_CUTOUT=0`。
