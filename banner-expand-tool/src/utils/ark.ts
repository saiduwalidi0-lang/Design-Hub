import { dataUrlToBase64 } from "@/utils/image";

export type ArkGenerateInput = {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  stream: boolean;
  watermark: boolean;
  sequentialImageGeneration: "disabled" | "enabled";
  responseFormat: "url" | "b64_json";
  referenceFieldName: string;
  referenceEncoding?: "data_url" | "base64";
  referenceImageDataUrl?: string | string[];
};

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

  return null;
}

function pickB64FromResponse(data: unknown) {
  const obj = asRecord(data);
  const d = obj ? obj["data"] : undefined;
  if (Array.isArray(d)) {
    const first = d[0];
    const firstObj = asRecord(first);
    const b = firstObj ? firstObj["b64_json"] : undefined;
    if (typeof b === "string" && b.length > 0) return b;
  }
  const dObj = asRecord(d);
  const b2 = dObj ? dObj["b64_json"] : undefined;
  if (typeof b2 === "string" && b2.length > 0) return b2;
  const direct = obj ? obj["b64_json"] : undefined;
  if (typeof direct === "string" && direct.length > 0) return direct;
  return null;
}

function pickErrorMessage(data: unknown) {
  const obj = asRecord(data);
  const err = obj ? asRecord(obj["error"]) : null;
  const errMessage = err ? err["message"] : undefined;
  if (typeof errMessage === "string" && errMessage.trim().length > 0) return errMessage;

  const msg = obj ? obj["message"] : undefined;
  if (typeof msg === "string" && msg.trim().length > 0) return msg;

  const errMsg = err ? err["msg"] : undefined;
  if (typeof errMsg === "string" && errMsg.trim().length > 0) return errMsg;

  if (typeof obj?.["error"] === "string" && obj["error"].trim().length > 0) return obj["error"];

  return "请求失败";
}

export async function arkGenerateImage(input: ArkGenerateInput) {
  const payload: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    sequential_image_generation: input.sequentialImageGeneration,
    response_format: input.responseFormat,
    size: input.size,
    stream: input.stream,
    watermark: input.watermark,
  };

  if (input.referenceImageDataUrl && input.referenceFieldName.trim().length > 0) {
    const encoding = input.referenceEncoding ?? "data_url";
    const v = input.referenceImageDataUrl;
    if (Array.isArray(v)) {
      payload[input.referenceFieldName.trim()] =
        encoding === "base64" ? v.map((x) => dataUrlToBase64(x)) : v;
    } else {
      payload[input.referenceFieldName.trim()] = encoding === "base64" ? dataUrlToBase64(v) : v;
    }
  }

  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg = pickErrorMessage(data);
    throw new Error(msg);
  }

  const url = pickUrlFromResponse(data);
  const b64Json = pickB64FromResponse(data);
  if (!url && !b64Json) throw new Error("未获取到结果图片");

  return { url: url ?? undefined, b64Json: b64Json ?? undefined, raw: data };
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
