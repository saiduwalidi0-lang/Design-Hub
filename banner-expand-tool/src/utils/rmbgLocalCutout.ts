import { blobToDataUrl, dataUrlToBlob } from "@/utils/image";

const defaultBase = (import.meta.env.VITE_RMBG_LOCAL_CLIENT_PATH ?? "/api/rmbg-local").replace(/\/$/, "");

/**
 * Calls local RMBG-2.0 HTTP service (see repo `rmbg-local-server`).
 * In dev, Vite proxies `/api/rmbg-local` → `VITE_RMBG_LOCAL_SERVER` (default http://127.0.0.1:8765).
 */
export async function cutoutWithRmbgLocalServer(inputDataUrl: string, basePath = defaultBase) {
  const ping = await fetch(`${basePath}/health`, { method: "GET" }).catch(() => null);
  if (!ping?.ok) {
    throw new Error(
      "无法连接本地 RMBG 服务。请在仓库根目录执行：cd rmbg-local-server && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python server.py"
    );
  }
  const health = (await ping.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!health?.ok) {
    const detail = health?.error ? `（${health.error}）` : "";
    throw new Error(`本地 RMBG 模型未就绪${detail}。请查看终端日志或先访问 ${basePath}/health。`);
  }

  const blob = dataUrlToBlob(inputDataUrl);
  const ext = blob.type === "image/jpeg" ? "jpg" : "png";
  const form = new FormData();
  form.append("image", blob, `input.${ext}`);

  const res = await fetch(`${basePath}/cutout`, { method: "POST", body: form }).catch(() => null);
  if (!res) {
    throw new Error("抠图请求失败（网络错误）");
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (j?.detail != null) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      const t = await res.text().catch(() => "");
      if (t) msg = t.slice(0, 500);
    }
    throw new Error(`抠图失败：${msg}`);
  }

  const outBlob = await res.blob();
  return blobToDataUrl(outBlob);
}
