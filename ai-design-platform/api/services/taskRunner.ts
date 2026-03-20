import { randomUUID } from 'crypto'
import type { CreateTaskInput, DesignTask } from '../types.js'
import { createTask, updateTask } from './tasksStore.js'
import { generatePlanWithAI, isAiConfigured } from './aiProvider.js'
import { fetchReferenceImagesFromUrls } from './openGraph.js'
import { asKvReferenceImage, buildTextToImageUrl } from './kvImage.js'
import { buildKvPromptFromDirection } from './kvPrompt.js'
import { generateArkImageToImage, isArkImageToImageConfigured } from './arkImageProvider.js'
import { saveImageBytes, saveImageDataUrl } from './referenceImageStore.js'
import {
  buildVisualDirections,
  generateDesignSpecMarkdownFromDirections,
} from './designSpecGenerator.js'

// #region debug-point
function reportDebug(event: Record<string, unknown>): void {
  const url =
    process.env.TRAE_DEBUG_SERVER_URL ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:7777/event')
  if (!url) return
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ts: new Date().toISOString(), where: 'taskRunner', ...event }),
  }).catch(() => {})
}
// #endregion debug-point

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function enqueueTask(input: CreateTaskInput): Promise<string> {
  const id = randomUUID()
  const now = new Date().toISOString()

  const task: DesignTask = {
    id,
    requirementText: input.requirementText,
    styleHint: input.styleHint,
    imageCount: input.imageCount,
    status: 'queued',
    stage: 'generating_spec',
    referenceImages: [],
    designSpecMarkdown: '',
    createdAt: now,
    updatedAt: now,
  }

  await createTask(task)

  // #region debug-point
  reportDebug({
    event: 'enqueueTask.created',
    id,
    imageCount: input.imageCount,
    hasStyleHint: !!input.styleHint,
    requirementLen: input.requirementText.length,
  })
  // #endregion debug-point

  setTimeout(() => {
    void runTask(id, input)
  }, 20)

  return id
}

async function runTask(id: string, input: CreateTaskInput): Promise<void> {
  const heartbeat = setInterval(() => {
    void updateTask(id, {}).catch(() => {})
  }, 15_000)

  try {
    // #region debug-point
    const runStartedAt = Date.now()
    reportDebug({ event: 'runTask.start', id })
    // #endregion debug-point

    await updateTask(id, { status: 'running', stage: 'generating_spec' })

    const uploaded = await (async () => {
      const urls = Array.isArray(input.referenceImageDataUrls)
        ? input.referenceImageDataUrls.slice(0, 3)
        : []
      const out: Array<{ dataUrl: string; name: string; image: any }> = []
      for (const dataUrl of urls) {
        const saved = await saveImageDataUrl({ dataUrl, prefix: `ref-${id}` }).catch(() => null)
        if (!saved) continue
        const url = `/api/assets/${saved.name}`
        out.push({
          dataUrl,
          name: saved.name,
          image: {
            url,
            thumbnailUrl: url,
            pageUrl: url,
            title: '参考图（上传）',
            source: 'User Provided',
            author: 'User',
            license: 'N/A',
            generation: 'user',
          },
        })
      }
      return out
    })()

    const uploadedImages = uploaded.map((x) => x.image)

    // #region debug-point
    reportDebug({ event: 'runTask.stage', id, stage: 'generating_spec' })
    // #endregion debug-point

    const aiConfigured = isAiConfigured()
    const aiResult = aiConfigured ? await generatePlanWithAI(input) : { plan: null as any, error: 'not_configured' }
    const aiPlan = aiResult.plan
    const directions = aiPlan?.directions ?? buildVisualDirections(input)
    const generationMode = aiPlan ? 'ai' : 'template'
    const generationNote = aiConfigured && !aiPlan
      ? `（已配置 AI，但本次调用失败，已自动回退为模板；原因：${aiResult.error ?? 'unknown'}）`
      : undefined

    const draftMarkdown = generateDesignSpecMarkdownFromDirections(input, {
      generationMode,
      generationNote,
      topic: aiPlan?.topic,
      directions,
      images: [],
      byDirection: undefined,
      externalImages: undefined,
    })

    await updateTask(id, { designSpecMarkdown: draftMarkdown })

    await updateTask(id, { stage: 'generating_kv' })

    const kvByDirection: Record<string, any[]> = {}
    const kvImages: any[] = []

    const kvBudget = Math.max(1, input.imageCount)
    let remainingKv = Math.max(1, kvBudget - uploadedImages.length)

    const refDataUrl = input.mode === 'revise' ? uploaded[0]?.dataUrl : undefined
    const canI2I = Boolean(refDataUrl) && isArkImageToImageConfigured()
    const refName = uploaded[0]?.name
    for (const d of directions) {
      const prompt = buildKvPromptFromDirection(input, d as any)

      const makeOne = async (imageSize: any, label: string) => {
        if (!canI2I) {
          const url = buildTextToImageUrl({ prompt, imageSize })
          return asKvReferenceImage({ url, prompt, directionName: `${d.name}${label}`, imageSize, generation: 't2i' })
        }

        const gen = await generateArkImageToImage({
          prompt,
          size: imageSize,
          images: [refDataUrl!],
        }).catch(() => null)

        if (!gen) {
          const url = buildTextToImageUrl({ prompt, imageSize })
          return asKvReferenceImage({ url, prompt, directionName: `${d.name}${label}`, imageSize, generation: 't2i' })
        }

        const saved = await saveImageBytes({
          bytes: gen.bytes,
          contentType: gen.contentType,
          prefix: `kv-${id}`,
        }).catch(() => null)

        if (!saved) {
          const url = buildTextToImageUrl({ prompt, imageSize })
          return asKvReferenceImage({ url, prompt, directionName: `${d.name}${label}`, imageSize, generation: 't2i' })
        }

        const url = `/api/assets/${saved.name}`
        return asKvReferenceImage({
          url,
          prompt,
          directionName: `${d.name}${label}`,
          imageSize,
          generation: 'i2i',
          usedReference: true,
          referenceName: refName,
        })
      }

      const img1 = await makeOne('landscape_16_9', '（16:9）')
      const img2 = remainingKv > 1
        ? await makeOne('portrait_16_9', '（9:16）')
        : asKvReferenceImage({
            url: buildTextToImageUrl({ prompt, imageSize: 'portrait_16_9' }),
            prompt,
            directionName: `${d.name}（9:16）`,
            imageSize: 'portrait_16_9',
            generation: 't2i',
          })

      kvByDirection[d.name] = [img1, img2]

      if (remainingKv > 0) {
        kvImages.push(img1)
        remainingKv -= 1
      }
      if (remainingKv > 0) {
        kvImages.push(img2)
        remainingKv -= 1
      }
    }

    const externalImages = await fetchReferenceImagesFromUrls(
      input.referenceUrls,
      Math.min(12, input.imageCount),
    )

    const mergedExternal = [...uploadedImages, ...(externalImages ?? [])]

    await updateTask(id, {
      stage: 'generating_spec',
      referenceImages: [...uploadedImages, ...kvImages].slice(
        0,
        Math.max(1, Math.min(Math.max(input.imageCount, uploadedImages.length), uploadedImages.length + kvImages.length)),
      ),
    })

    const finalMarkdown = generateDesignSpecMarkdownFromDirections(input, {
      generationMode,
      generationNote,
      topic: aiPlan?.topic,
      directions,
      images: [],
      byDirection: undefined,
      externalImages: mergedExternal,
      kvByDirection: kvByDirection as any,
    })

    await updateTask(id, {
      status: 'succeeded',
      stage: undefined,
      designSpecMarkdown: finalMarkdown,
    })

    // #region debug-point
    reportDebug({ event: 'runTask.done', id, status: 'succeeded', durationMs: Date.now() - runStartedAt })
    // #endregion debug-point
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'

    // #region debug-point
    reportDebug({
      event: 'runTask.error',
      id,
      errorMessage: message,
      errorName: e instanceof Error ? e.name : undefined,
      errorStack: e instanceof Error ? e.stack : undefined,
    })
    // #endregion debug-point
    await updateTask(id, {
      status: 'failed',
      stage: undefined,
      errorMessage: message,
    })
  } finally {
    clearInterval(heartbeat)
  }
}
