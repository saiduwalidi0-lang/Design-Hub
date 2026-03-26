"""
Local HTTP API for BRIA RMBG-2.0 (Hugging Face `briaai/RMBG-2.0`), no ComfyUI.
See: https://github.com/Bria-AI/RMBG-2.0
License: CC BY-NC 4.0 for non-commercial use; commercial use requires BRIA agreement.
"""

from __future__ import annotations

import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# 从本目录 .env 读取 HF_TOKEN（勿提交 .env）
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

import torch
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

ModelHolder = dict[str, object | None]


def pick_device() -> str:
    forced = os.environ.get("RMBG_DEVICE", "").strip().lower()
    if forced in ("cpu", "cuda", "mps"):
        return forced
    if torch.cuda.is_available():
        return "cuda"
    # RMBG-2.0 在部分 torch+MPS 组合下 from_pretrained 会报 meta tensor；默认用 CPU（可设 RMBG_DEVICE=mps 尝试）
    if torch.backends.mps.is_available() and os.environ.get("RMBG_USE_MPS", "").strip() == "1":
        return "mps"
    return "cpu"


def resolve_hf_token() -> str | bool:
    """Gated model: need HF account + access on model page, then token or `hf auth login`."""
    env = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if env and env.strip():
        return env.strip()
    return True


def load_model(device: str):
    torch.set_float32_matmul_precision("high")
    # low_cpu_mem_usage=False：避免 accelerate 用 meta tensor 初始化后在 MPS 上报错
    model = AutoModelForImageSegmentation.from_pretrained(
        "briaai/RMBG-2.0",
        trust_remote_code=True,
        token=resolve_hf_token(),
        low_cpu_mem_usage=False,
        torch_dtype=torch.float32,
    )
    model.to(device)
    model.eval()
    return model


holder: ModelHolder = {"model": None, "device": None, "load_error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    device = pick_device()
    holder["device"] = device
    try:
        holder["model"] = load_model(device)
        holder["load_error"] = None
    except Exception as e:  # noqa: BLE001 — surface to /health
        holder["model"] = None
        holder["load_error"] = str(e)
    yield
    holder["model"] = None


app = FastAPI(title="RMBG-2.0 Local", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {
        "ok": holder["model"] is not None,
        "device": holder["device"],
        "error": holder["load_error"],
    }


@app.post("/cutout")
async def cutout(image: UploadFile = File(...)) -> Response:
    model = holder["model"]
    device = holder["device"]
    if model is None or device is None:
        msg = holder.get("load_error") or "model not loaded"
        raise HTTPException(status_code=503, detail=str(msg))

    try:
        raw = await image.read()
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"invalid image: {e}") from e

    orig_size = pil.size
    image_size = (1024, 1024)
    transform_image = transforms.Compose(
        [
            transforms.Resize(image_size),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    batch = transform_image(pil).unsqueeze(0).to(device)

    try:
        with torch.no_grad():
            preds = model(batch)[-1].sigmoid()
            if device != "cpu":
                preds = preds.cpu()
        pred = preds[0].squeeze()
        mask_pil = transforms.ToPILImage()(pred)
        mask = mask_pil.resize(orig_size, Image.Resampling.BILINEAR)
        out = pil.copy()
        out.putalpha(mask)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"inference failed: {e}") from e

    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


def main() -> None:
    host = os.environ.get("RMBG_HOST", "127.0.0.1")
    port = int(os.environ.get("RMBG_PORT", "8765"))
    uvicorn.run("server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
