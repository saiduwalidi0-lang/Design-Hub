import * as Lark from '@larksuiteoapi/node-sdk'
import type { CreateTaskInput } from '../types.js'
import { enqueueTask } from './taskRunner.js'
import {
  downloadImageBytes,
  parseImageKeyFromMessageContent,
  parseUserText,
  parsePostContent,
  replyTextMessage,
} from './feishu.js'
import { getTask } from './tasksStore.js'
import { buildIdeaMessage, extractIdeaKvUrls } from './feishuIdeaMessage.js'
import { replyImageMessage, uploadImageFromBytes, uploadImageFromUrl } from './feishu.js'
import { buildEnrichedRequirementText, fetchPrdTextFromMessage } from './feishuPrd.js'
import { clearDraft, compactDraftPreview, getDraft, isGenerateSignal, isResetSignal, upsertDraft } from './feishuConversation.js'
import { isFrontendSignal, isLastResultSignal } from './feishuConversation.js'
import { generateArkImage, isArkImageConfigured } from './arkImageProvider.js'
import { analyzeImageWithAI } from './aiProvider.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function getFrontendBase(): string {
  return env('PUBLIC_BASE_URL') ?? 'http://localhost:5174'
}

function envFlag(name: string): boolean {
  const v = env(name)
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

type Dedupe = {
  seen: Map<string, number>
  max: number
}

function createDedupe(max: number): Dedupe {
  return { seen: new Map(), max }
}

function dedupeHas(d: Dedupe, key: string): boolean {
  const now = Date.now()
  const hit = d.seen.get(key)
  if (hit && now - hit < 10 * 60_000) return true
  d.seen.set(key, now)
  if (d.seen.size > d.max) {
    const keys = [...d.seen.keys()].slice(0, Math.max(1, Math.floor(d.max / 5)))
    for (const k of keys) d.seen.delete(k)
  }
  return false
}

function pickMessageId(data: any): string | null {
  return (
    data?.event?.message?.message_id ||
    data?.message?.message_id ||
    data?.message_id ||
    null
  )
}

function pickChatId(data: any): string | null {
  return (
    data?.event?.message?.chat_id ||
    data?.message?.chat_id ||
    data?.chat_id ||
    null
  )
}

function pickMessageType(data: any): string | null {
  return (
    data?.event?.message?.message_type ||
    data?.message?.message_type ||
    data?.message_type ||
    null
  )
}

function pickContentRaw(data: any): string | null {
  return (
    data?.event?.message?.content ||
    data?.message?.content ||
    data?.content ||
    null
  )
}

function parseTextFromContentRaw(contentRaw: string): string {
  try {
    const parsed = JSON.parse(contentRaw)
    if (typeof parsed?.text === 'string') return parsed.text
    return ''
  } catch {
    return ''
  }
}

function enrichRequirementWithImageInsight(draft: { requirementText: string; imageInsight?: string }): string {
  const base = draft.requirementText?.trim() ?? ''
  const insight = draft.imageInsight?.trim()
  if (!insight) return base
  if (base.includes('参考图识别')) return base
  return [base, '', '参考图识别：', insight].filter(Boolean).join('\n')
}

export function startFeishuLongConnection(): {
  enabled: boolean
  started: boolean
  reason?: string
} {
  const enabled = envFlag('FEISHU_LONGCONN_ENABLE')
  if (!enabled) return { enabled: false, started: false, reason: 'disabled' }

  const appId = env('FEISHU_APP_ID')
  const appSecret = env('FEISHU_APP_SECRET')
  if (!appId || !appSecret) {
    return { enabled: true, started: false, reason: 'missing_app_credentials' }
  }

  const loggerLevel = (env('FEISHU_LONGCONN_LOG_LEVEL') ?? 'info').toLowerCase()
  const level =
    loggerLevel === 'debug'
      ? Lark.LoggerLevel.debug
      : loggerLevel === 'warn'
        ? Lark.LoggerLevel.warn
        : loggerLevel === 'error'
          ? Lark.LoggerLevel.error
          : Lark.LoggerLevel.info

  const dedupe = createDedupe(2000)

  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    loggerLevel: level,
  })

  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        const messageId = pickMessageId(data)
        if (!messageId) return
        if (dedupeHas(dedupe, messageId)) return

        const chatId = pickChatId(data)
        const sessionKey = chatId ? `chat:${chatId}` : `msg:${messageId}`

        const contentRaw = pickContentRaw(data)

        const messageType = pickMessageType(data)
        if (messageType === 'post') {
          if (typeof contentRaw !== 'string') return
          const post = parsePostContent(contentRaw)

          if (post.imageKeys.length > 0) {
            void replyTextMessage({
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

              upsertDraft(sessionKey, {
                requirementText: post.text || getDraft(sessionKey)?.requirementText || '',
              })

              await replyTextMessage({
                messageId,
                text: ['我已记下文字需求。图片识别失败（模型可能不支持多模态）。', '确认后回复“开始生成”。'].join('\n'),
              }).catch(() => {})
            })()

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
            void replyTextMessage({
              messageId,
              text: ['收到，我先记下需求。', '', preview, '', '如果要开始出方案，回复“开始生成”。'].join('\n'),
            }).catch(() => {})
          }
          return
        }

        if (messageType === 'image') {
          const imageKey = typeof contentRaw === 'string'
            ? parseImageKeyFromMessageContent(contentRaw)
            : null
          if (!imageKey) {
            void replyTextMessage({ messageId, text: '我收到了图片消息，但没有解析到 image_key。你可以再发一次。' }).catch(() => {})
            return
          }

          void replyTextMessage({
            messageId,
            text: '收到图片，我先识别一下内容（不会立刻生成方案）。识别完成后你再回复“开始生成”。',
          }).catch(() => {})

          void (async () => {
            const img = await downloadImageBytes({ imageKey }).catch(() => null)
            if (!img) {
              await replyTextMessage({ messageId, text: '图片下载失败，可能权限不足或图片过期。' }).catch(() => {})
              return
            }

            const r = await analyzeImageWithAI({
              bytes: img.bytes,
              contentType: img.contentType,
            })

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

          return
        }

        if (messageType !== 'text') {
          void replyTextMessage({
            messageId,
            text: '目前支持：纯文本、纯图片、以及图文混合（post）。你可以一次发图+文字，或分两条发。',
          }).catch(() => {})
          return
        }

        if (typeof contentRaw !== 'string') return
        const text = parseTextFromContentRaw(contentRaw)

        if (isFrontendSignal(text)) {
          void replyTextMessage({ messageId, text: `前端地址：${getFrontendBase()}` }).catch(() => {})
          return
        }

        if (isLastResultSignal(text)) {
          const d = getDraft(sessionKey)
          if (d?.lastTaskId) {
            const url = `${getFrontendBase().replace(/\/$/, '')}/tasks/${d.lastTaskId}`
            void replyTextMessage({ messageId, text: `上次结果：${url}` }).catch(() => {})
          } else {
            void replyTextMessage({ messageId, text: '我这里还没有可用的上次结果链接。' }).catch(() => {})
          }
          return
        }

        if (isResetSignal(text)) {
          clearDraft(sessionKey)
          void replyTextMessage({ messageId, text: '已清空上下文。把你的需求/PRD 发我，确认后再回复“开始生成”。' }).catch(() => {})
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

          void replyTextMessage({
            messageId,
            text: ['收到，我先记下需求。', '', preview, '', hint].filter(Boolean).join('\n'),
          }).catch(() => {})
          return
        }

        const draft = getDraft(sessionKey)
        if (!draft?.requirementText?.trim()) {
          void replyTextMessage({ messageId, text: '我这边还没有收到需求内容。请先发需求/PRD，再回复“开始生成”。' }).catch(() => {})
          return
        }

        const imageCount = Number.isFinite(draft.imageCount)
          ? Math.max(3, Math.min(12, Math.floor(draft.imageCount!)))
          : 6

        const input: CreateTaskInput = {
          requirementText: enrichRequirementWithImageInsight({
            requirementText: draft.requirementText,
            imageInsight: draft.imageInsight,
          }),
          styleHint: draft.styleHint,
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


        void replyTextMessage({
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
              await replyTextMessage({
                messageId,
                text: [buildIdeaMessage(t), '', `前端详情：${url}`].join('\n').trim(),
              }).catch(() => {})

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
              await replyTextMessage({
                messageId,
                text: `生成失败：${t.errorMessage ?? 'unknown'}`,
              }).catch(() => {})
              return
            }
            await new Promise((r) => setTimeout(r, 1200))
          }
          await replyTextMessage({
            messageId,
            text: '生成超时：任务可能仍在运行。你可以稍后再发“继续”让我补发结果。',
          }).catch(() => {})
        })()
      },
    }),
  })

  return { enabled: true, started: true }
}
