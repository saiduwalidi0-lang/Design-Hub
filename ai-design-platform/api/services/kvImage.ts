import type { ReferenceImage } from '../types.js'

export type KvImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'

export function buildTextToImageUrl(input: {
  prompt: string
  imageSize: KvImageSize
}): string {
  const base = 'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image'
  const url = new URL(base)
  url.searchParams.set('prompt', input.prompt)
  url.searchParams.set('image_size', input.imageSize)
  return url.toString()
}

export function asKvReferenceImage(input: {
  url: string
  prompt: string
  directionName?: string
  imageSize: KvImageSize
  generation?: 't2i' | 'i2i'
  usedReference?: boolean
  referenceName?: string
}): ReferenceImage {
  const title = input.directionName
    ? `KV 示意图｜${input.directionName}`
    : 'KV 示意图'
  return {
    url: input.url,
    thumbnailUrl: input.url,
    pageUrl: input.url,
    title,
    source: 'AI Generated',
    author: 'Text-to-Image',
    license: 'N/A',
    prompt: input.prompt,
    imageSize: input.imageSize,
    generation: input.generation ?? 't2i',
    usedReference: input.usedReference,
    referenceName: input.referenceName,
  }
}
