# 飞书文档写入工具（docx）

用飞书开放平台 API：创建「新版文档 docx」并把 Markdown/HTML 写入为文档块。

## 1. 前置条件

在飞书开放平台创建「企业自建应用」，并完成：

- 应用已安装到企业
- 已开通云文档相关能力（在应用功能/权限里）
- 权限（至少）
  - 创建文档：`docx:document:create`
  - 读取文档/块：`docx:document:read`、`docx:document.block:read`
  - 写入块：`docx:document.block:create`
  - 转换 Markdown/HTML：`docx:document.block:convert`

最短路径（参考）：

- 开放平台控制台 → 创建企业自建应用
- 权限管理 → 勾选上述权限 → 发布版本
- 应用发布/安装 → 安装到本企业

凭据：在应用后台拿到 `App ID` 和 `App Secret`。

## 2. 配置环境变量

在终端设置：

```bash
set FEISHU_APP_ID=cli_xxx
set FEISHU_APP_SECRET=xxx
```

可选：

- `FEISHU_BASE_URL`：默认 `https://open.feishu.cn`

## 3. 使用方式

### 3.1 创建新文档并写入 Markdown

```bash
node scripts/feishu-doc-writer/index.mjs --title "第二期KV 绿色概念方案" --markdown-file scripts/feishu-doc-writer/templates/kv-v2.md
```

### 3.2 写入到已有文档（追加）

```bash
node scripts/feishu-doc-writer/index.mjs --document-id doxcnxxxxxxxxxxxx --markdown-file ./content.md
```

### 3.3 从 stdin 读取

```bash
type .\content.md | node scripts/feishu-doc-writer/index.mjs --title "从stdin创建" --stdin
```

在 Windows/CI 场景下，为了避免命令行引号转义问题，优先使用 `--markdown-file` 或 `--stdin`。

## 4. 常见问题

- `403 forbidden`：通常是权限没开/应用没安装到企业/文档不在可访问范围。
- 写入已有文档失败：用的是 `tenant_access_token`，应用默认只对“自己创建的文档”天然有权限；写入别人的文档时，需要先把文档（或其所在文件夹）共享给该应用，或确保文档在应用可访问的范围内。
- `400` 且提到 convert：补齐 `docx:document.block:convert` 权限。
- 文档写入位置不对：默认写到根节点末尾，可用 `--debug` 查看根块与返回块结构。

## 5. 快速取值

- `document_id`：从文档链接里提取（一般是 `.../docx/<document_id>` 或 `.../docs/<document_id>`）。
- `folder_token`：从文件夹链接里提取（一般在 URL 路径或 query 中）。
