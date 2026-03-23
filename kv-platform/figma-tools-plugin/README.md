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

1) Figma Desktop → `Plugins` → `Development` → `Import plugin from manifest...`
2) 选择本工程的 `manifest.json`
3) 运行插件即可看到工具列表

## 「同步到 CMS」使用说明

1) 确保 CMS 后端可访问（默认 `http://localhost:3001`）
2) 在 Figma 中选中要导出的 Frame/Component/Instance（或选择“当前页顶层”）
3) 打开插件 → `同步到 CMS` → 点击 `导出并同步`
4) 插件会调用 CMS 的 `POST /api/figma-import` 导入数据（默认导入为未发布）

## 备注

- 网络访问域名目前在 `manifest.json` 的 `networkAccess.allowedDomains` 中限制为本地 CMS；如需指向测试/生产环境，需要同步加入域名。
