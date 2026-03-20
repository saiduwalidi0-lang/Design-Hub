## 火山方舟（Ark）OpenAI 兼容配置

本项目支持“可选接入大模型”生成视觉方向与搜图关键词。

### 1) 在 `.env.local` 配置（推荐）

在项目根目录（`ai-design-platform/`）新建或编辑 `.env.local`：

```env
# 火山方舟（OpenAI 兼容协议）
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
AI_MODEL=ark-code-latest
AI_API_KEY=你的_api_key
```

注意：不要使用 `https://ark.cn-beijing.volces.com/api/v3`（会产生额外费用）。

### 2) 重启本地服务

如果你正在运行 `npm run dev`，重启一次使 `.env` 生效。

### 3) 验证是否真的走了 AI

新建任务后，在输出的 Markdown 里会看到：
- `## 生成方式`：显示 `大模型` 或 `模板`
- 如果已配置 AI 但调用失败，会显示“已回退为模板”的原因提示
