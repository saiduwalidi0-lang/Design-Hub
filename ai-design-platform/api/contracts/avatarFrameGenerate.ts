/**
 * 头像框生成 HTTP 契约 — 与 `kv-platform/figma-tools-plugin` 中
 * `KvToAvatarFramePage`（HTTP 模式）请求体、响应字段一致。
 *
 * 入口：POST `{baseUrl}/api/avatar-frame/generate`
 * 默认 baseUrl：`http://localhost:3004`（`npm run dev:avatar-frame-api`）
 *
 * 服务端流程（配置 Ark 后）：
 * 1. 读取默认模板 PNG（main / surround / top，来自 banner-expand-tool/public/avatar-frame-defaults）
 * 2. 三次 Ark 图生图：KV + 各模板 → element1/2/3 原始图
 * 3. 若未关闭抠图：每张图 POST 到 RMBG 本地服务 `RMBG_LOCAL_URL/cutout`（默认 127.0.0.1:8765）
 * 4. 按 spec 将三元素合成 compositeDataUrl（层级：环绕 → 主元素 → 顶部在上；再经裁切后的图层）
 *
 * 未配置 Ark 且非 production：返回与上述字段相同的 mock PNG（见 avatarFrameMockGenerate）。
 */

/** 插件与 HTTP 客户端应发送的 JSON body */
export type AvatarFrameGenerateRequestBody = {
  kvPngDataUrl: string
  prompts?: Partial<{
    element1: string
    element2: string
    element3: string
  }>
  /** 影响 mock 合成与框位；真 AI 路径下插件用于对齐，服务端主要用默认 prompts + 磁盘模板 */
  spec?: AvatarFrameGenerateSpec
  kvJson?: unknown
}

export type AvatarFrameGenerateSpec = {
  /** S / M / L，与插件「交付档位」一致；S/M 可不传 element3 框位 */
  level?: 'S' | 'M' | 'L'
  figmaFrame?: { width?: number; height?: number }
  targetFrame?: { width?: number; height?: number }
  boxes?: Partial<
    Record<
      'element1' | 'element2' | 'element3',
      { x: number; y: number; width: number; height: number; align?: string }
    >
  >
}

/** 成功时 JSON 响应（与插件 parseGenResponse 兼容） */
export type AvatarFrameGenerateResponseBody = {
  element1DataUrl: string
  element2DataUrl: string
  element3DataUrl: string
  /** 三元素按 spec.boxes 合成；可能缺省 */
  compositeDataUrl?: string
  warnings?: string[]
}

/** 错误时：`{ error: string }`，常见 error 见路由实现 */
export type AvatarFrameGenerateErrorBody = {
  error: string
}
