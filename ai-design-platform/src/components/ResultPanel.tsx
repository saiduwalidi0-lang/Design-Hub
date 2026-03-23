import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, Link2, Save, TriangleAlert } from 'lucide-react'
import type { DesignTask } from '@/types'
import Gallery from '@/components/Gallery'
import MarkdownViewer from '@/components/MarkdownViewer'
import { GridSkeleton, TextSkeleton } from '@/components/Skeleton'
import { copyText } from '@/utils/clipboard'
import { downloadText } from '@/utils/download'
import { renderKvImage } from '@/utils/api'

type TabKey = 'images' | 'spec'

function formatTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function formatMs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function stageText(stage?: DesignTask['stage']): string {
  if (stage === 'generating_kv') return '生成 KV 示意图（AI）'
  if (stage === 'searching_images') return '搜索参考图（Wikimedia Commons）'
  if (stage === 'generating_spec') return '生成设计方案（Markdown）'
  return '—'
}

function statusColor(status?: DesignTask['status']): string {
  if (status === 'failed') return 'bg-rose-400/70'
  if (status === 'succeeded') return 'bg-emerald-400/70'
  if (status === 'running') return 'bg-indigo-400/70'
  return 'bg-zinc-400/60'
}

export default function ResultPanel(props: {
  task: DesignTask | null
  taskId: string | null
  loading: boolean
  error: string | null
  shareUrl: string | null
  onOpenTask: (() => void) | null
  onRetry: (() => void) | null
  compact?: boolean
}) {
  const [tab, setTab] = useState<TabKey>('images')
  const [now, setNow] = useState(() => Date.now())
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null)
  const [overrideUrls, setOverrideUrls] = useState<Record<string, string>>({})
  const [renderHint, setRenderHint] = useState<string | null>(null)

  useEffect(() => {
    setOverrideUrls({})
    setRenderHint(null)
  }, [props.taskId])

  useEffect(() => {
    const shouldTick = props.loading || props.task?.status === 'running'
    if (!shouldTick) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [props.loading, props.task?.status])

  const elapsedMs = useMemo(() => {
    if (!props.task?.createdAt) return null
    const created = new Date(props.task.createdAt).getTime()
    if (!Number.isFinite(created)) return null
    return Math.max(0, now - created)
  }, [now, props.task?.createdAt])

  const stageLabel = useMemo(() => {
    const s = props.task?.stage
    if (s === 'generating_spec') return '正在生成视觉方案（Keywords / Storytelling / Moodboard）…'
    if (s === 'generating_kv') return '正在生成 KV 示意图（AI）…'
    if (s === 'searching_images') {
      return props.task?.designSpecMarkdown
        ? '方案已生成，正在根据方案搜索参考图（Wikimedia Commons）…'
        : '正在根据方案搜索参考图（Wikimedia Commons）…'
    }
    return '生成中…'
  }, [props.task?.stage])

  const errorDetail = useMemo(() => {
    if (!props.error) return null
    const task = props.task
    const extra: string[] = []
    if (task?.status) extra.push(`任务状态：${task.status}`)
    if (task?.stage) extra.push(`当前阶段：${stageText(task.stage)}`)
    if (task?.updatedAt) extra.push(`最后更新：${formatTime(task.updatedAt)}`)
    if (task?.errorMessage && task.errorMessage !== props.error) {
      extra.push(`后端错误：${task.errorMessage}`)
    }

    if (props.error.includes('超时') && task?.status === 'running') {
      extra.unshift('说明：前端等待超时，但任务可能仍在运行。')
    }

    return extra.length ? extra.join(' · ') : null
  }, [props.error, props.task])

  const imageSearchDebug = props.task?.debug?.imageSearch

  const canCopy = Boolean(props.task?.designSpecMarkdown)
  const canDownload = Boolean(props.task?.designSpecMarkdown)
  const canShare = Boolean(props.shareUrl)

  const refAssetName = useMemo(() => {
    const u = props.task?.referenceImages?.find((x) => x.source === 'User Provided')?.url
    if (!u) return null
    const m = u.match(/\/api\/assets\/([^/?#]+)/)
    return m?.[1] ?? null
  }, [props.task?.referenceImages])

  const canRenderWithRef = useMemo(() => {
    if (!props.task || props.task.status !== 'succeeded') return false
    if (!refAssetName) return false
    return (props.task.referenceImages ?? []).some(
      (x) => x.source === 'AI Generated' && typeof x.url === 'string' && x.url.includes('text_to_image?prompt='),
    )
  }, [props.task, refAssetName])

  const imagesForView = useMemo(() => {
    const imgs = props.task?.referenceImages ?? []
    if (Object.keys(overrideUrls).length === 0) return imgs
    return imgs.map((img) => {
      const next = overrideUrls[img.url]
      if (!next) return img
      return { ...img, url: next, thumbnailUrl: next, pageUrl: next }
    })
  }, [props.task?.referenceImages, overrideUrls])

  return (
    <div
      className={`rounded-xl border border-white/10 bg-[#111827] shadow-sm ${
        props.compact ? 'p-4' : 'p-4'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('images')}
            className={`rounded-md px-3 py-2 text-sm ${
              tab === 'images'
                ? 'bg-white/10 text-zinc-100'
                : 'text-zinc-300 hover:bg-white/5'
            }`}
          >
            参考图
          </button>
          <button
            type="button"
            onClick={() => setTab('spec')}
            className={`rounded-md px-3 py-2 text-sm ${
              tab === 'spec'
                ? 'bg-white/10 text-zinc-100'
                : 'text-zinc-300 hover:bg-white/5'
            }`}
          >
            设计方案
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!props.taskId}
            onClick={() => props.onOpenTask?.()}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            查看任务
          </button>

          <button
            type="button"
            disabled={!canShare}
            onClick={async () => {
              if (!props.shareUrl) return
              await copyText(props.shareUrl)
            }}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            复制分享链接
          </button>

          <button
            type="button"
            disabled={!canCopy}
            onClick={async () => {
              if (!props.task?.designSpecMarkdown) return
              await copyText(props.task.designSpecMarkdown)
            }}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            复制方案
          </button>

          <button
            type="button"
            disabled={!canDownload}
            onClick={() => {
              if (!props.task?.designSpecMarkdown || !props.taskId) return
              downloadText(props.task.designSpecMarkdown, `design-spec-${props.taskId}.md`)
            }}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            下载 Markdown
          </button>

          <button
            type="button"
            disabled={!canRenderWithRef || rendering}
            onClick={async () => {
              if (!props.task) return
              if (!refAssetName) return
              const targets = (props.task.referenceImages ?? [])
                .filter((x) => x.source === 'AI Generated' && x.url.includes('text_to_image?prompt='))
                .slice(0, 3)
              if (targets.length === 0) return

              setRendering(true)
              setRenderProgress({ done: 0, total: targets.length })
              setRenderHint(null)
              try {
                const next: Record<string, string> = {}
                let done = 0
                for (const img of targets) {
                  let prompt = ''
                  let imageSize = 'landscape_16_9'
                  try {
                    const url = new URL(img.url)
                    prompt = url.searchParams.get('prompt') ?? ''
                    imageSize = url.searchParams.get('image_size') ?? 'landscape_16_9'
                  } catch {
                    continue
                  }
                  if (!prompt) continue
                  const r = await renderKvImage({ prompt, imageSize, referenceAssetName: refAssetName })
                  if (r.success) next[img.url] = r.url
                  done += 1
                  setRenderProgress({ done, total: targets.length })
                }
                if (Object.keys(next).length > 0) {
                  setOverrideUrls((prev) => ({ ...prev, ...next }))
                } else {
                  setRenderHint('重绘未产出新图：请确认参考图尺寸足够、模型支持图生图、以及 ARK_I2I_* 配置正确。')
                }
              } finally {
                setRendering(false)
                setRenderProgress(null)
              }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {rendering
              ? `重绘中…${renderProgress ? `（${renderProgress.done}/${renderProgress.total}）` : ''}`
              : '重绘KV（基于参考图）'}
          </button>
        </div>
      </div>

      {renderHint ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
          {renderHint}
        </div>
      ) : null}

      <div className="mt-4">
        {props.loading ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
              {stageLabel}
            </div>
            {props.task ? (
              <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
                <summary className="cursor-pointer select-none text-zinc-200">
                  查看搜索过程
                </summary>
                <div className="mt-2 grid gap-2 text-zinc-300">
                  <div>阶段：{stageText(props.task.stage)}</div>
                  <div>创建：{formatTime(props.task.createdAt)} · 更新：{formatTime(props.task.updatedAt)}</div>
                  {imageSearchDebug?.attempts?.length ? (
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-zinc-200">图片搜索尝试</div>
                      {imageSearchDebug.directionQueries ? (
                        <div className="mt-1 text-zinc-300">
                          {Object.entries(imageSearchDebug.directionQueries)
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <div key={k} className="mt-1">
                                <div className="text-zinc-200">{k}</div>
                                <div className="font-mono text-[11px]">{v.slice(0, 3).join(' · ')}</div>
                              </div>
                            ))}
                        </div>
                      ) : null}
                      <div className="mt-1 grid gap-1">
                        {imageSearchDebug.attempts.slice(0, 8).map((a, idx) => (
                          <div key={idx} className="font-mono text-[11px] text-zinc-300">
                            {idx + 1}. {a.direction ? `[${a.direction}] ` : ''}q="{a.query}" · ok={String(a.ok)}
                            {typeof a.status === 'number' ? ` · status=${a.status}` : ''}
                            {typeof a.pagesCount === 'number' ? ` · pages=${a.pagesCount}` : ''}
                            {a.durationMs != null ? ` · t=${formatMs(a.durationMs)}` : ''}
                            {a.errorMessage ? ` · err=${a.errorMessage}` : ''}
                          </div>
                        ))}
                      </div>
                      {imageSearchDebug.chosenQuery ? (
                        <div className="mt-2 text-zinc-300">
                          命中 query：<span className="font-mono text-[11px]">{imageSearchDebug.chosenQuery}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
            {tab === 'spec' && props.task?.designSpecMarkdown ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <MarkdownViewer markdown={props.task.designSpecMarkdown} />
              </div>
            ) : tab === 'images' ? (
              <GridSkeleton />
            ) : (
              <TextSkeleton lines={10} />
            )}
          </div>
        ) : props.error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 text-rose-300" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-rose-200">生成失败</div>
                <div className="mt-1 text-sm text-rose-100/90">{props.error}</div>
                {errorDetail ? (
                  <div className="mt-2 text-xs text-rose-100/80">{errorDetail}</div>
                ) : null}
                {elapsedMs != null && props.task?.status === 'running' ? (
                  <div className="mt-2 text-xs text-rose-100/80">
                    已运行：{formatMs(elapsedMs)}
                  </div>
                ) : null}

                {props.task?.debug?.imageSearch?.attempts?.length ? (
                  <details className="mt-3 rounded-md border border-rose-500/20 bg-black/20 p-3 text-xs text-rose-100/80">
                    <summary className="cursor-pointer select-none text-rose-100/90">
                      查看搜索过程
                    </summary>
                    {props.task.debug.imageSearch.directionQueries ? (
                      <div className="mt-2">
                        {Object.entries(props.task.debug.imageSearch.directionQueries)
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <div key={k} className="mt-1">
                              <div className="text-rose-100/90">{k}</div>
                              <div className="font-mono text-[11px]">{v.slice(0, 3).join(' · ')}</div>
                            </div>
                          ))}
                      </div>
                    ) : null}
                    <div className="mt-2 grid gap-1">
                      {props.task.debug.imageSearch.attempts.slice(0, 8).map((a, idx) => (
                        <div key={idx} className="font-mono text-[11px]">
                          {idx + 1}. {a.direction ? `[${a.direction}] ` : ''}q="{a.query}" · ok={String(a.ok)}
                          {typeof a.status === 'number' ? ` · status=${a.status}` : ''}
                          {typeof a.pagesCount === 'number' ? ` · pages=${a.pagesCount}` : ''}
                          {a.durationMs != null ? ` · t=${formatMs(a.durationMs)}` : ''}
                          {a.errorMessage ? ` · err=${a.errorMessage}` : ''}
                        </div>
                      ))}
                    </div>
                    {props.task.debug.imageSearch.chosenQuery ? (
                      <div className="mt-2">
                        命中 query：<span className="font-mono text-[11px]">{props.task.debug.imageSearch.chosenQuery}</span>
                      </div>
                    ) : null}
                  </details>
                ) : null}

                {props.onRetry ? (
                  <button
                    type="button"
                    onClick={() => props.onRetry?.()}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm hover:bg-rose-500/15"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : !props.task ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-sm text-zinc-400">
            右侧会展示参考图与设计方案。先在左侧输入需求并开始生成。
          </div>
        ) : tab === 'images' ? (
          <Gallery images={imagesForView} />
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <MarkdownViewer markdown={props.task.designSpecMarkdown || '（暂无方案）'} />
          </div>
        )}
      </div>

      {!props.compact && props.taskId ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${statusColor(props.task?.status)}`} />
            {props.task?.status ? `状态：${props.task.status}` : '状态：-'}
            {props.task?.stage ? ` · 阶段：${stageText(props.task.stage)}` : ''}
            {props.task?.createdAt ? ` · 创建：${new Date(props.task.createdAt).toLocaleString()}` : ''}
            {elapsedMs != null ? ` · 已运行：${formatMs(elapsedMs)}` : ''}
          </div>
          {props.shareUrl ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">分享链接：</span>
              <span className="max-w-[420px] truncate font-mono text-[11px] text-zinc-300">
                {props.shareUrl}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              生成完成后可复制分享链接
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
