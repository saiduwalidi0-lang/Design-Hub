import { Router, type Request, type Response } from 'express'
import type { CreateTaskInput } from '../types.js'
import { enqueueTask } from '../services/taskRunner.js'
import {
  downloadImageBytes,
  parseImageKeyFromMessageContent,
  parseUserText,
  parsePostContent,
  replyImageMessage,
  replyTextMessage,
  uploadImageFromBytes,
  uploadImageFromUrl,
  verifyEventToken,
} from '../services/feishu.js'
import { getTask } from '../services/tasksStore.js'
import { buildIdeaMessage, extractIdeaKvUrls } from '../services/feishuIdeaMessage.js'
import { buildEnrichedRequirementText, fetchPrdTextFromMessage } from '../services/feishuPrd.js'
import {
  clearDraft,
  compactDraftPreview,
  getDraft,
  isFrontendSignal,
  isGenerateSignal,
  isLastResultSignal,
  isResetSignal,
  upsertDraft,
} from '../services/feishuConversation.js'
import { generateArkImage, isArkImageConfigured } from '../services/arkImageProvider.js'
import { analyzeImageWithAI } from '../services/aiProvider.js'
import {
  feishuReplyAvatarFrameResult,
  isFeishuAvatarFrameImageModeEnabled,
} from '../services/feishuAvatarFrameBot.js'

function enrichRequirementWithImageInsight(draft: { requirementText: string; imageInsight?: string }): string {
  const base = draft.requirementText?.trim() ?? ''
  const insight = draft.imageInsight?.trim()
  if (!insight) return base
  if (base.includes('参考图识别')) return base
  return [base, '', '参考图识别：', insight].filter(Boolean).join('\n')
}

function getFrontendBase(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:5174'
}

const router = Router()

router.post('/event', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as any

  if (body?.challenge) {
    res.status(200).json({ challenge: body.challenge })
    return
  }

  if (!verifyEventToken(body)) {
    res.status(401).json({ success: false, error: 'invalid_event_token' })
    return
  }

  const eventType = body?.header?.event_type
  if (eventType !== 'im.message.receive_v1') {
    res.status(200).json({ success: true })
    return
  }

  const messageId = body?.event?.message?.message_id
  const chatId = body?.event?.message?.chat_id
  const messageType = body?.event?.message?.message_type
  const contentRaw = body?.event?.message?.content

  if (typeof messageId !== 'string') {
    res.status(200).json({ success: true })
    return
  }

  const sessionKey = typeof chatId === 'string' && chatId.trim() ? `chat:${chatId}` : `msg:${messageId}`

  if (messageType === 'post' && typeof contentRaw === 'string') {
    const post = parsePostContent(contentRaw)

    if (
      isFeishuAvatarFrameImageModeEnabled() &&
      post.imageKeys.length > 0 &&
      !post.text.trim()
    ) {
      const first = post.imageKeys[0]
      res.status(200).json({ success: true })
      void (async () => {
        const img = await downloadImageBytes({ imageKey: first }).catch(() => null)
        if (!img) {
          await replyTextMessage({ messageId, text: '图片下载失败，可能权限不足或图片过期。' }).catch(() => {})
          return
        }
        await feishuReplyAvatarFrameResult({
          messageId,
          kvBytes: img.bytes,
          contentType: img.contentType,
        })
      })()
      return
    }

    if (post.imageKeys.length > 0) {
      await replyTextMessage({
        messageId,
        text: '收到图文消息，我先识别图片并记录文字（不会立刻生成）。识别完成后你再回复“开始生成”。',
      }).catch(() => {})

      void (async () => {
        const first = post.imageKeys[0]
        const img = await downloadImageBytes({ imageKey: first }).catch(() => null)
        if (!img) {
          await replyTextMessage({ messageId, text: '图片下载失败，可能权限不足或图片过期。' }).catch(() => {})
          return
        }

        const r = await analyzeImageWithAI({ bytes: img.bytes, contentType: img.contentType })
        if (r.text) {
          upsertDraft(sessionKey, {
            requirementText: post.text || getDraft(sessionKey)?.requirementText || '',
            imageInsight: r.text,
          })
          await replyTextMessage({
            messageId,
            text: ['我对图片的理解：', r.text, '', '我也记下了你的文字需求。确认后回复“开始生成”。'].join('\n'),
          }).catch(() => {})
          return
        }

        upsertDraft(sessionKey, { requirementText: post.text || getDraft(sessionKey)?.requirementText || '' })
        await replyTextMessage({
          messageId,
          text: ['我已记下文字需求。图片识别失败（模型可能不支持多模态）。', '确认后回复“开始生成”。'].join('\n'),
        }).catch(() => {})
      })()

      res.status(200).json({ success: true })
      return
    }

    if (post.text.trim()) {
      const payload = parseUserText(post.text)
      const enriched = await fetchPrdTextFromMessage(payload.requirementText, { timeoutMs: 1600 }).catch(() => null)
      const requirementText = enriched?.prdText
        ? buildEnrichedRequirementText({ original: payload.requirementText, prdText: enriched.prdText })
        : payload.requirementText

      const draft = upsertDraft(sessionKey, {
        requirementText,
        styleHint: payload.styleHint,
        imageCount: payload.imageCount,
        prdSource: enriched?.source,
      })

      const preview = compactDraftPreview(draft)
      await replyTextMessage({
        messageId,
        text: ['收到，我先记下需求。', '', preview, '', '如果要开始出方案，回复“开始生成”。'].join('\n'),
      }).catch(() => {})
    }

    res.status(200).json({ success: true })
    return
  }

  if (messageType === 'image' && typeof contentRaw === 'string') {
    const imageKey = parseImageKeyFromMessageContent(contentRaw)
    if (!imageKey) {
      await replyTextMessage({ messageId, text: '我收到了图片消息，但没有解析到 image_key。你可以再发一次。' }).catch(() => {})
      res.status(200).json({ success: true })
      return
    }

    if (isFeishuAvatarFrameImageModeEnabled()) {
      res.status(200).json({ success: true })
      void (async () => {
        const img = await downloadImageBytes({ imageKey }).catch(() => null)
        if (!img) {
          await replyTextMessage({ messageId, text: '图片下载失败，可能权限不足或图片过期。' }).catch(() => {})
          return
        }
        await feishuReplyAvatarFrameResult({
          messageId,
          kvBytes: img.bytes,
          contentType: img.contentType,
        })
      })()
      return
    }

    await replyTextMessage({
      messageId,
      text: '收到图片，我先识别一下内容（不会立刻生成方案）。识别完成后你再回复“开始生成”。',
    }).catch(() => {})

    void (async () => {
      const img = await downloadImageBytes({ imageKey }).catch(() => null)
      if (!img) {
        await replyTextMessage({ messageId, text: '图片下载失败，可能权限不足或图片过期。' }).catch(() => {})
        return
      }

      const r = await analyzeImageWithAI({ bytes: img.bytes, contentType: img.contentType })
      if (!r.text) {
        await replyTextMessage({
          messageId,
          text:
            r.error === 'image_too_large'
              ? '图片太大，暂时无法识别。请发一张更小的图或截图。'
              : '图片识别失败（模型可能不支持多模态）。你也可以补充一句文字描述。',
        }).catch(() => {})
        return
      }

      upsertDraft(sessionKey, {
        requirementText: getDraft(sessionKey)?.requirementText ?? '',
        imageInsight: r.text,
      })

      await replyTextMessage({
        messageId,
        text: ['我对图片的理解：', r.text, '', '如果要开始出方案，回复“开始生成”。'].join('\n'),
      }).catch(() => {})
    })()

    res.status(200).json({ success: true })
    return
  }

  if (messageType !== 'text' || typeof contentRaw !== 'string') {
    await replyTextMessage({
      messageId,
      text: '目前支持：纯文本、纯图片、以及图文混合（post）。你可以一次发图+文字，或分两条发。',
    }).catch(() => {})
    res.status(200).json({ success: true })
    return
  }

  let parsed: any
  try {
    parsed = JSON.parse(contentRaw)
  } catch {
    parsed = null
  }
  const text = typeof parsed?.text === 'string' ? parsed.text : ''

  if (isFrontendSignal(text)) {
    await replyTextMessage({ messageId, text: `前端地址：${getFrontendBase()}` }).catch(() => {})
    res.status(200).json({ success: true })
    return
  }

  if (isLastResultSignal(text)) {
    const d = getDraft(sessionKey)
    if (d?.lastTaskId) {
      const url = `${getFrontendBase().replace(/\/$/, '')}/tasks/${d.lastTaskId}`
      await replyTextMessage({ messageId, text: `上次结果：${url}` }).catch(() => {})
    } else {
      await replyTextMessage({ messageId, text: '我这里还没有可用的上次结果链接。' }).catch(() => {})
    }
    res.status(200).json({ success: true })
    return
  }

  if (isResetSignal(text)) {
    clearDraft(sessionKey)
    await replyTextMessage({ messageId, text: '已清空上下文。把你的需求/PRD 发我，确认后再回复“开始生成”。' }).catch(() => {})
    res.status(200).json({ success: true })
    return
  }

  if (!isGenerateSignal(text)) {
    const payload = parseUserText(text)
    const enriched = await fetchPrdTextFromMessage(payload.requirementText, { timeoutMs: 1600 }).catch(() => null)
    const requirementText = enriched?.prdText
      ? buildEnrichedRequirementText({ original: payload.requirementText, prdText: enriched.prdText })
      : payload.requirementText

    const draft = upsertDraft(sessionKey, {
      requirementText,
      styleHint: payload.styleHint,
      imageCount: payload.imageCount,
      prdSource: enriched?.source,
    })

    const preview = compactDraftPreview(draft)
    const hint = enriched?.prdText
      ? '我已读取到 PRD 原文。确认无误后回复“开始生成”。'
      : payload.requirementText.includes('http')
        ? '我暂时没拿到 PRD 原文（可能是权限/空间限制）。如果需要严格按 PRD 生成，请把文档共享给该机器人应用；确认后回复“开始生成”。'
        : '如果要开始出方案，回复“开始生成”。'

    await replyTextMessage({
      messageId,
      text: ['收到，我先记下需求。', '', preview, '', hint].filter(Boolean).join('\n'),
    }).catch(() => {})

    res.status(200).json({ success: true })
    return
  }

  const draft = getDraft(sessionKey)
  if (!draft?.requirementText?.trim()) {
    await replyTextMessage({ messageId, text: '我这边还没有收到需求内容。请先发需求/PRD，再回复“开始生成”。' }).catch(() => {})
    res.status(200).json({ success: true })
    return
  }

  const payload = { requirementText: draft.requirementText, styleHint: draft.styleHint, imageCount: draft.imageCount }

  const imageCount = Number.isFinite(payload.imageCount)
    ? Math.max(3, Math.min(12, Math.floor(payload.imageCount!)))
    : 6

  const input: CreateTaskInput = {
    requirementText: enrichRequirementWithImageInsight({
      requirementText: payload.requirementText,
      imageInsight: draft.imageInsight,
    }),
    styleHint: payload.styleHint,
    imageCount,
  }

  const taskId = await enqueueTask(input)

  upsertDraft(sessionKey, {
    requirementText: draft.requirementText,
    styleHint: draft.styleHint,
    imageCount: draft.imageCount,
    prdSource: draft.prdSource,
    imageInsight: draft.imageInsight,
    lastTaskId: taskId,
  })

  await replyTextMessage({
    messageId,
    text: '收到，我先生成 3 个方向 + KV 示意图，稍后直接在这里回你方案要点。',
  }).catch(() => {})

  void (async () => {
    const started = Date.now()
    const timeoutMs = 180_000
    while (Date.now() - started < timeoutMs) {
      const t = await getTask(taskId)
      if (!t) break
      if (t.status === 'succeeded') {
        const url = `${getFrontendBase().replace(/\/$/, '')}/tasks/${taskId}`
        await replyTextMessage({ messageId, text: [buildIdeaMessage(t), '', `前端详情：${url}`].join('\n').trim() }).catch(() => {})
        const urls = extractIdeaKvUrls(t)
        let sent = 0
        for (const u of urls) {
          const prompt = (() => {
            try {
              const url = new URL(u)
              return url.searchParams.get('prompt')
            } catch {
              return null
            }
          })()

          const size = (() => {
            try {
              const url = new URL(u)
              return (url.searchParams.get('image_size') || 'landscape_16_9') as any
            } catch {
              return 'landscape_16_9' as any
            }
          })()

          const uploaded = isArkImageConfigured() && prompt
            ? await (async () => {
                const img = await generateArkImage({ prompt, size })
                return await uploadImageFromBytes({
                  bytes: img.bytes,
                  filename: 'kv.png',
                  contentType: img.contentType,
                })
              })().catch(() => null)
            : await uploadImageFromUrl({ imageUrl: u }).catch(() => null)
          if (!uploaded?.imageKey) continue
          await replyImageMessage({ messageId, imageKey: uploaded.imageKey }).catch(() => {})
          sent += 1
        }
        if (urls.length > 0 && sent === 0) {
          await replyTextMessage({
            messageId,
            text: 'KV 图片还在生成或暂时无法拉取，我会稍后补发；你也可以 30 秒后再发“开始生成”让我重试发图。',
          }).catch(() => {})
        }
        return
      }
      if (t.status === 'failed') {
        await replyTextMessage({ messageId, text: `生成失败：${t.errorMessage ?? 'unknown'}` }).catch(() => {})
        return
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
    await replyTextMessage({
      messageId,
      text: '生成超时：任务可能仍在运行。你可以稍后再发“继续”让我补发结果。',
    }).catch(() => {})
  })()

  res.status(200).json({ success: true })
})

export default router
