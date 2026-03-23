import { blobToDataUrl, dataUrlToBlob } from "@/utils/image";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function pickUrlFromResponse(data: unknown) {
  const obj = asRecord(data);
  const directUrl = obj ? obj["url"] : undefined;
  if (typeof directUrl === "string" && directUrl.length > 0) return directUrl;

  const d = obj ? obj["data"] : undefined;
  if (Array.isArray(d)) {
    const first = d[0];
    const firstObj = asRecord(first);
    const u = firstObj ? firstObj["url"] : undefined;
    if (typeof u === "string" && u.length > 0) return u;
  }
  const dObj = asRecord(d);
  const u2 = dObj ? dObj["url"] : undefined;
  if (typeof u2 === "string" && u2.length > 0) return u2;

  const result = obj ? asRecord(obj["result"]) : null;
  const u3 = result ? result["url"] : undefined;
  if (typeof u3 === "string" && u3.length > 0) return u3;

  return null;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function hmacSha256Hex(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let lastCallAt = 0;
async function throttleQps(maxQps: number) {
  const gap = Math.max(0, Math.floor(1000 / Math.max(1, maxQps)));
  const now = Date.now();
  const wait = lastCallAt ? Math.max(0, lastCallAt + gap - now) : 0;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export type ByteArtistCutoutConfig = {
  host: string;
  apiPath: string;
  appKey: string;
  appSecret: string;
  bizTags?: string;
  algorithms?: string;
  refineMask?: number;
};

export async function cutoutWithByteArtistAFr(inputImageDataUrl: string, cfg: ByteArtistCutoutConfig) {
  if (!cfg.host.trim() || !cfg.apiPath.trim()) throw new Error("未配置抠图服务地址");
  if (!cfg.appKey.trim() || !cfg.appSecret.trim()) throw new Error("未配置 app_key/app_secret");

  await throttleQps(1);

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 10000);
  const sign = await hmacSha256Hex(`${nonce}${timestamp}`, cfg.appSecret.trim());

  const blob = dataUrlToBlob(inputImageDataUrl);
  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
  const filename = `image.${ext}`;
  const file = new File([blob], filename, { type: blob.type });

  const form = new FormData();
  form.append("algorithms", cfg.algorithms ?? "image_clip");
  form.append("img_return_format", "png");
  form.append("img_return_type", "url");
  form.append("data_return_type", "single");
  if (cfg.bizTags) form.append("biz_tags", cfg.bizTags);
  if (typeof cfg.refineMask === "number") form.append("refine_mask", String(cfg.refineMask));
  form.append("file", file);

  const url = new URL(cfg.apiPath, cfg.host);
  url.searchParams.set("app_key", cfg.appKey.trim());
  url.searchParams.set("nonce", String(nonce));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);

  const requestUrl = url.origin === window.location.origin ? url.toString() : "/api/byteartist-afr";

  let res: Response;
  try {
    res = await fetch(requestUrl, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new Error("网络请求失败（可能是浏览器跨域/CORS 或网络不可达）。已默认走 /api/byteartist-afr 代理。");
  }

  const text = await res.text().catch(() => "");
  const data = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const obj = asRecord(data);
    const msg = obj && typeof obj["message"] === "string" ? String(obj["message"]) : text || `抠图请求失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }

  const obj = asRecord(data);
  const statusCode = obj ? obj["status_code"] : undefined;
  if (typeof statusCode === "number" && statusCode !== 0) {
    const msg = obj && typeof obj["status_msg"] === "string" ? String(obj["status_msg"]) : "Upstream error";
    throw new Error(msg);
  }

  const outUrl = pickUrlFromResponse(data);
  if (!outUrl) throw new Error("抠图服务未返回结果 URL");

  let imgRes: Response;
  try {
    imgRes = await fetch(outUrl);
  } catch {
    throw new Error("抠图结果 URL 无法下载（可能跨域/CORS）。建议在后端代理下载并返回 PNG。 ");
  }
  if (!imgRes.ok) throw new Error(`下载抠图结果失败（HTTP ${imgRes.status}）`);
  const outBlob = await imgRes.blob();
  return await blobToDataUrl(outBlob);
}
