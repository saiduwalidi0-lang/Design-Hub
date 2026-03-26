/**
 * 开发环境默认使用相对路径 /api/*，由 Vite 代理到 CMS（见 vite.config.ts）。
 * 若需直连指定后端，可在 .env 中设置 VITE_CMS_ORIGIN=http://localhost:3001
 */
export function cmsApiUrl(apiPath: string): string {
  const raw = import.meta.env.VITE_CMS_ORIGIN as string | undefined;
  const base = raw?.replace(/\/$/, '') ?? '';
  const p = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return base ? `${base}${p}` : p;
}

const CMS_HINT =
  '请先在本机启动 CMS：进入 kv-platform/cms 目录执行 node index.js（默认端口 3001），再刷新本页重试。';

/** 解析 API JSON；若收到 HTML（常见于 CMS 未启动或代理失败）给出明确提示 */
export async function readCMSJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const t = text.trim();
  if (t.startsWith('<!DOCTYPE') || t.startsWith('<html') || t.startsWith('<!doctype')) {
    throw new Error(`接口返回了网页而非数据。${CMS_HINT}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`接口返回无法解析为 JSON。${CMS_HINT} 片段：${t.slice(0, 160)}`);
  }
}
