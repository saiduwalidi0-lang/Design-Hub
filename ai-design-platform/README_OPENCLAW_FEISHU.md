## 连接云端 OpenClaw（OpenAI 兼容）

本项目的大模型调用走 OpenAI 兼容的 `chat/completions` 协议。

在 `ai-design-platform/.env.local` 配置（推荐自动从 `D:/openclaw/config/openclaw.json` 读取网关鉴权）：

```env
OPENCLAW_ENABLE=1
OPENCLAW_CONFIG_PATH=D:/openclaw/config/openclaw.json

AI_BASE_URL=http://127.0.0.1:18789/v1
AI_MODEL=auto
AI_API_KEY=
```

说明：
- `OPENCLAW_ENABLE=1` 时，后端会从 `openclaw.json` 读取 `gateway.auth` 并注入到 `AI_API_KEY`（不会写回文件）。
- 可用 `GET /api/ai/status` 检查服务端是否已读取配置。

### 本地直连 vs SSH 隧道

如果你的 OpenClaw 网关在云端默认只绑定回环（`bind: loopback`），推荐用 SSH 隧道把云端 18789 映射到本机：

```bash
ssh -N -L 18789:127.0.0.1:18789 root@<你的云端IP>
```

然后配置：

```env
AI_BASE_URL=http://127.0.0.1:18789/v1
```

## 接入飞书机器人（事件回调）

### 1) 配置飞书应用

在飞书开放平台创建「机器人」应用，并获取：
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

事件订阅：
- 回调地址：`https://<你的域名>/api/feishu/event`
- 订阅事件：`im.message.receive_v1`
- （推荐）设置 Verification Token，并填入 `FEISHU_VERIFICATION_TOKEN`

### 2) 配置环境变量

在 `ai-design-platform/.env.local` 配置：

```env
PUBLIC_BASE_URL=https://<你的前端访问域名>

FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx
FEISHU_VERIFICATION_TOKEN=xxx

FEISHU_WIKI_SPACE_NAME=AI 设计方案（独立空间）
```

`PUBLIC_BASE_URL` 用于机器人回复里拼接任务链接（`/tasks/<taskId>`）。

## 使用长连接接收事件（推荐本地开发）

飞书支持通过服务端 SDK 建立 WebSocket 长连接来接收事件（无需公网域名/无需内网穿透）。本项目已集成长连接客户端。

### 1) 开启长连接

在 `ai-design-platform/.env.local` 增加：

```env
FEISHU_LONGCONN_ENABLE=1
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx
```

然后运行本项目后端（`npm run dev`），控制台出现连接成功日志后，回到飞书开放平台「事件与回调」里选择“使用长连接接收事件”并保存。

注意：长连接只支持企业自建应用；同一应用多客户端时为集群模式（随机一个收到事件）。

## 火山方舟图片模型（可选，用于飞书内直接发真图）

若你希望彻底避免“占位图/生成中”问题，可直接接入火山方舟图片生成 API（Seedream 等）。本项目会在飞书发图时优先用方舟生成图片并以二进制上传到飞书。

在 `ai-design-platform/.env.local` 配置：

```env
ARK_T2I_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_T2I_MODEL=doubao-seedream-5-0-260128
ARK_T2I_API_KEY=<你的方舟API Key>
ARK_T2I_SIZE=2K
ARK_T2I_RESPONSE_FORMAT=url
ARK_T2I_SEQUENTIAL=disabled
ARK_T2I_WATERMARK=true
ARK_T2I_STREAM=false

ARK_I2I_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_I2I_MODEL=doubao-seedream-5-0-260128
ARK_I2I_API_KEY=<你的方舟API Key>
ARK_I2I_SIZE=2K
ARK_I2I_RESPONSE_FORMAT=url
ARK_I2I_SEQUENTIAL=disabled
ARK_I2I_WATERMARK=true
ARK_I2I_STREAM=false
ARK_I2I_IMAGE_FIELD=image
ARK_I2I_IMAGE_SOURCE=base64
```

接口参考：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`。

## Figma 参考稿（可选）

如果你会在「参考链接」里粘贴 Figma 文件链接（`https://www.figma.com/file/...` 或 `https://www.figma.com/design/...`），可在 `ai-design-platform/.env.local` 配置：

```env
FIGMA_TOKEN=<你的Figma Personal Access Token>
```

配置后，系统会尝试把该 Figma 文件的缩略图抓取为参考图并加入 Moodboard。

说明：Figma “库/团队范围按关键词搜索”需要额外的 Team/Project 权限与 API 设计（可按需扩展）。

### 3) 机器人使用方式

在飞书对机器人发送文本（第一步只记录上下文，不会立刻生成）：

```
做一个“印加文明直播预告海报”的 KV 方案
风格：深色高级感
数量：6
```

机器人会回复它记录到的需求摘要。确认无误后再发送：

```
开始生成
```

机器人会在飞书内直接回复“方案要点 + KV 图片”（无需打开前端链接）。

### 4) 创建独立知识库空间（可选）

如果你不想和其他知识混淆，可以让这个机器人单独创建一个「知识库空间（Wiki Space）」。

在本地调用（建议设置 `FEISHU_ADMIN_TOKEN` 并带上 `x-admin-token`）：

```bash
curl -X POST http://localhost:3002/api/feishu/wiki/create_space \
  -H "content-type: application/json" \
  -H "x-admin-token: <你的FEISHU_ADMIN_TOKEN>" \
  -d "{\"name\":\"AI 设计方案（独立空间）\"}"
```

成功会返回 `space_id`。后续如果需要把生成的方案自动写入该空间，我们可以在下一步增加“写入文档/新建页面”的能力。
