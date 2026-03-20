import { blobToDataUrl, dataUrlToBlob } from "@/utils/image";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function comfyFetch(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error("无法连接到本地 ComfyUI（请确认 ComfyUI 已启动，且端口配置正确）");
  }
}

type UploadResult = { name: string; subfolder?: string; type?: string };

type ComfyImageRef = {
  filename: string;
  subfolder?: string;
  type?: string;
};

function pickFirstImageRef(history: unknown): ComfyImageRef | null {
  const queue: unknown[] = [history];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;
    const images = obj["images"];
    if (Array.isArray(images)) {
      for (const it of images) {
        if (!it || typeof it !== "object") continue;
        const rec = it as Record<string, unknown>;
        const filename = rec["filename"];
        if (typeof filename === "string" && filename) {
          return {
            filename,
            subfolder: typeof rec["subfolder"] === "string" ? rec["subfolder"] : undefined,
            type: typeof rec["type"] === "string" ? rec["type"] : undefined,
          };
        }
      }
    }
    for (const k of Object.keys(obj)) queue.push(obj[k]);
  }
  return null;
}

async function uploadToComfyUi(inputDataUrl: string): Promise<UploadResult> {
  const blob = dataUrlToBlob(inputDataUrl);
  const filename = `banner_expand_${Date.now()}_${Math.floor(Math.random() * 10000)}.png`;
  const file = new File([blob], filename, { type: blob.type || "image/png" });

  const form = new FormData();
  form.append("image", file);
  form.append("type", "input");
  form.append("overwrite", "true");

  const res = await comfyFetch("/api/comfyui/upload/image", { method: "POST", body: form });
  if (!res.ok) throw new Error(`ComfyUI 上传失败（HTTP ${res.status}）`);
  return (await res.json()) as UploadResult;
}

async function queuePrompt(prompt: unknown) {
  const res = await comfyFetch("/api/comfyui/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const err = obj ? obj["error"] : undefined;
    const msg = typeof err === "string" && err.trim().length > 0 ? err : "提交任务失败";
    throw new Error(msg);
  }
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const promptId = obj ? obj["prompt_id"] : undefined;
  if (typeof promptId !== "string" || !promptId) throw new Error("ComfyUI 未返回 prompt_id");
  return promptId;
}

async function waitForHistory(promptId: string, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await comfyFetch(`/api/comfyui/history/${encodeURIComponent(promptId)}`);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const entry = (obj[promptId] as unknown) ?? data;
        const img = pickFirstImageRef(entry);
        if (img) return img;
      }
    }
    await sleep(650);
  }
  throw new Error("ComfyUI 抠图超时");
}

async function fetchViewImage(img: ComfyImageRef) {
  const url = new URL("/api/comfyui/view", window.location.origin);
  url.searchParams.set("filename", img.filename);
  if (img.subfolder) url.searchParams.set("subfolder", img.subfolder);
  url.searchParams.set("type", img.type || "output");
  const res = await comfyFetch(url.toString());
  if (!res.ok) throw new Error(`ComfyUI 取图失败（HTTP ${res.status}）`);
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

export type ComfyUiRmbgOptions = {
  model?: "RMBG-2.0" | "INSPYRENET" | "BEN" | "BEN2";
  processRes?: number;
  sensitivity?: number;
  maskBlur?: number;
  maskOffset?: number;
  invertOutput?: boolean;
  refineForeground?: boolean;
};

export async function cutoutWithComfyUiRmbg(inputDataUrl: string, options: ComfyUiRmbgOptions = {}) {
  const ping = await comfyFetch("/api/comfyui/system_stats");
  if (!ping.ok) throw new Error("无法连接到本地 ComfyUI（请确认 ComfyUI 已启动且端口正确）");

  const uploaded = await uploadToComfyUi(inputDataUrl);
  const imageName = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;

  const prompt = {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: imageName,
      },
    },
    "2": {
      class_type: "RMBG",
      inputs: {
        image: ["1", 0],
        model: options.model ?? "RMBG-2.0",
        sensitivity: options.sensitivity ?? 1.0,
        process_res: options.processRes ?? 1024,
        mask_blur: options.maskBlur ?? 0,
        mask_offset: options.maskOffset ?? 0,
        invert_output: options.invertOutput ?? false,
        refine_foreground: options.refineForeground ?? false,
        background: "Alpha",
        background_color: "#00000000",
      },
    },
    "3": {
      class_type: "SaveImage",
      inputs: {
        images: ["2", 0],
        filename_prefix: "banner_expand_tool_rmbg",
      },
    },
  };

  const promptId = await queuePrompt(prompt);
  const imgRef = await waitForHistory(promptId);
  return await fetchViewImage(imgRef);
}
