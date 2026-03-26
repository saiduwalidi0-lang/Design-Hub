# 本地 RMBG-2.0 服务（无 ComfyUI）

通过 [Hugging Face `briaai/RMBG-2.0`](https://huggingface.co/briaai/RMBG-2.0) 在本地提供 HTTP 抠图接口，供 `banner-expand-tool` 的「本地 RMBG（无 ComfyUI）」选项，以及 **`ai-design-platform` 头像框 API**（`POST /api/avatar-frame/generate` 在 Ark 出图后的去背）调用。

模型说明与许可见 [Bria-AI/RMBG-2.0](https://github.com/Bria-AI/RMBG-2.0)（非商用 CC BY-NC 4.0；商用需单独授权）。

## 环境

- Python 3.10+
- 首次运行会从 Hugging Face 下载权重，需能访问外网

## Hugging Face 门控（必做）

[`briaai/RMBG-2.0`](https://huggingface.co/briaai/RMBG-2.0) 是**门控仓库**，必须先：

1. 登录 [Hugging Face](https://huggingface.co/)，打开模型页，**同意条款 / Request access**（通过后才能下载）。
2. 任选一种方式提供令牌（推荐文件方式，避免每次 export）：
   - **推荐**：在本目录执行 `cp .env.example .env`，编辑 `.env` 填入 `HF_TOKEN=hf_你的令牌`，再运行 `python server.py`（服务启动时会自动加载 `.env`）。
   - 或在虚拟环境里执行：`.venv/bin/hf auth login`（按提示粘贴 **Read** 权限的 Access Token）。
   - 或临时：`export HF_TOKEN=hf_xxx` 后再启动 `python server.py`。

未登录时 `/health` 里会出现 `401` / `gated repo` 类错误，属正常现象。

## 安装与启动

```bash
cd rmbg-local-server
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
hf auth login
python server.py
```

默认监听 `http://127.0.0.1:8765`。

- **Apple Silicon**：默认用 **CPU** 推理（避免 RMBG 在部分 MPS 上的兼容问题）。若要试 GPU：`RMBG_USE_MPS=1 python server.py` 或 `RMBG_DEVICE=mps python server.py`。
- **端口**：`RMBG_PORT=8766 python server.py`

## 接口

- `GET /health` — 是否加载成功
- `POST /cutout` — `multipart/form-data`，字段名 `image`，返回 PNG（带透明通道）

## 与前端联调

在 `banner-expand-tool` 目录启动 Vite（`npm run dev`）。默认把 `/api/rmbg-local` 代理到本服务。

可在 `banner-expand-tool/.env.local` 中覆盖代理目标：

```bash
VITE_RMBG_LOCAL_SERVER=http://127.0.0.1:8765
```

若前后端不同源且自行部署，可设置 `VITE_RMBG_LOCAL_CLIENT_PATH` 为可访问的完整路径前缀（需服务端允许 CORS）。
