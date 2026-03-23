import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InputCard from '@/components/InputCard'
import PageShell from '@/components/PageShell'
import ResultPanel from '@/components/ResultPanel'
import type { DesignTask } from '@/types'
import { analyzeImage, createTask, getFigmaIndexStatus, getTask, searchFigmaLibrary, startFigmaIndex, stopFigmaIndex } from '@/utils/api'

type Stage = 'idle' | 'polling'

// #region debug-point
function reportDebug(event: Record<string, unknown>): void {
  const url =
    (import.meta.env.VITE_TRAE_DEBUG_SERVER_URL as string | undefined) ??
    (import.meta.env.DEV ? 'http://127.0.0.1:7777/event' : '')
  if (!url) return
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ts: new Date().toISOString(), where: 'Home', ...event }),
  }).catch(() => {})
}
// #endregion debug-point

export default function Home() {
  const navigate = useNavigate()
  const [requirementText, setRequirementText] = useState('')
  const [styleHint, setStyleHint] = useState('')
  const [referenceUrlsText, setReferenceUrlsText] = useState('')
  const [imageCount, setImageCount] = useState(6)
  const [mode, setMode] = useState<'generate' | 'revise'>('generate')
  const [referenceImages, setReferenceImages] = useState<Array<{ name: string; dataUrl: string }>>([])
  const [imageInsight, setImageInsight] = useState('')
  const [analyzingImages, setAnalyzingImages] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [task, setTask] = useState<DesignTask | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)

  const [figmaQuery, setFigmaQuery] = useState('')
  const [figmaResults, setFigmaResults] = useState<
    Array<{ name: string; fileUrl: string; thumbnailUrl?: string; project?: string; caption?: string }>
  >([])
  const [figmaSearching, setFigmaSearching] = useState(false)
  const [figmaMode, setFigmaMode] = useState<'name' | 'ai'>('ai')
  const [figmaIndex, setFigmaIndex] = useState<any | null>(null)
  const [figmaIndexLoading, setFigmaIndexLoading] = useState(false)
  const [figmaNormalized, setFigmaNormalized] = useState<{ original: string; normalized: string; tags: string[] } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      setFigmaIndexLoading(true)
      const r = await getFigmaIndexStatus()
      setFigmaIndexLoading(false)
      if (!alive) return
      if (r.success) setFigmaIndex(r.status)
    })()

    const t = setInterval(() => {
      void (async () => {
        const r = await getFigmaIndexStatus()
        if (!alive) return
        if (r.success) setFigmaIndex(r.status)
      })()
    }, 2500)

    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const canSubmit = requirementText.trim().length > 0 && stage === 'idle'

  const shareUrl = useMemo(() => {
    if (!taskId) return null
    return `${window.location.origin}/tasks/${taskId}`
  }, [taskId])

  async function poll(id: string) {
    setStage('polling')
    setError(null)

    const startedAt = Date.now()
    const timeoutMs = 180_000

    // #region debug-point
    let lastSnapshot = ''
    let consecutiveErrors = 0
    reportDebug({ event: 'poll.start', id, timeoutMs })
    // #endregion debug-point

    while (true) {
      const res = await getTask(id)
      if (!res.success) {
        const msg = ('error' in res ? res.error : undefined) ?? '加载任务失败'
        consecutiveErrors += 1

        // #region debug-point
        reportDebug({ event: 'poll.error', id, error: msg, consecutiveErrors })
        // #endregion debug-point

        if (Date.now() - startedAt <= timeoutMs && consecutiveErrors <= 5) {
          await new Promise((r) => setTimeout(r, 800))
          continue
        }

        setError(msg)
        setStage('idle')
        return
      }

      consecutiveErrors = 0

      setTask(res.task)

      // #region debug-point
      const snapshot = `${res.task.status}:${res.task.stage ?? ''}:${res.task.referenceImages.length}`
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        reportDebug({
          event: 'poll.snapshot',
          id,
          status: res.task.status,
          stage: res.task.stage,
          imagesCount: res.task.referenceImages.length,
        })
      }
      // #endregion debug-point

      if (res.task.status === 'succeeded') {
        setStage('idle')

        // #region debug-point
        reportDebug({ event: 'poll.done', id, status: 'succeeded', elapsedMs: Date.now() - startedAt })
        // #endregion debug-point
        return
      }

      if (res.task.status === 'failed') {
        setError(res.task.errorMessage ?? '任务失败')
        setStage('idle')

        // #region debug-point
        reportDebug({
          event: 'poll.done',
          id,
          status: 'failed',
          elapsedMs: Date.now() - startedAt,
          errorMessage: res.task.errorMessage ?? '任务失败',
        })
        // #endregion debug-point
        return
      }

      if (Date.now() - startedAt > timeoutMs) {
        setError('任务超时，请重试')
        setStage('idle')

        // #region debug-point
        reportDebug({ event: 'poll.timeout', id, elapsedMs: Date.now() - startedAt })
        // #endregion debug-point
        return
      }

      await new Promise((r) => setTimeout(r, 600))
    }
  }

  async function onSubmit() {
    if (!canSubmit) return
    setTask(null)
    setError(null)

    let insight = imageInsight.trim()
    if (referenceImages.length > 0 && !insight) {
      setAnalyzingImages(true)
      const res = await analyzeImage({ dataUrl: referenceImages[0].dataUrl })
      setAnalyzingImages(false)
      if (res.success) {
        insight = res.text
        setImageInsight(res.text)
      }
    }

    const requirementToSend = (() => {
      const base = requirementText.trim()
      const parts: string[] = [base]
      if (mode === 'revise') {
        parts.push('', '模式：基于参考图改版（尽量保持主氛围与关键元素一致）')
      }
      if (insight) {
        parts.push('', '参考图识别：', insight)
      }
      return parts.filter(Boolean).join('\n')
    })()

    // #region debug-point
    reportDebug({
      event: 'submit',
      requirementLen: requirementText.length,
      styleHintLen: styleHint.length,
      imageCount,
    })
    // #endregion debug-point

    const res = await createTask({
      requirementText: requirementToSend,
      styleHint: styleHint.trim() || undefined,
      imageCount,
      mode,
      referenceImageDataUrls: referenceImages.slice(0, 3).map((x) => x.dataUrl),
      referenceUrls: referenceUrlsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12),
    })

    if (!res.success) {
      setError(('error' in res ? res.error : undefined) ?? '创建任务失败')

      // #region debug-point
      reportDebug({ event: 'submit.error', error: ('error' in res ? res.error : undefined) ?? '创建任务失败' })
      // #endregion debug-point
      return
    }

    setTaskId(res.taskId)

    // #region debug-point
    reportDebug({ event: 'submit.created', taskId: res.taskId })
    // #endregion debug-point
    void poll(res.taskId)
  }

  function onFillExample() {
    setRequirementText(
      '做一个“印加文明主题直播海报”的灵感收集与方案生成页面。\n目标用户：直播运营与视觉设计。\n需要展示参考图画廊、输出结构化设计方案（Markdown），并可生成分享链接。',
    )
    setStyleHint('文化/遗址/梯田/深色高级感')
    setReferenceUrlsText('')
    setImageCount(6)
    setMode('generate')
    setReferenceImages([])
    setImageInsight('')
  }

  function onClear() {
    setRequirementText('')
    setStyleHint('')
    setReferenceUrlsText('')
    setImageCount(6)
    setMode('generate')
    setReferenceImages([])
    setImageInsight('')
    setAnalyzingImages(false)
    setTaskId(null)
    setTask(null)
    setError(null)
    setStage('idle')

    setFigmaQuery('')
    setFigmaResults([])
    setFigmaSearching(false)
    setFigmaMode('ai')
    setFigmaNormalized(null)
  }

  async function onSearchFigma() {
    const q = figmaQuery.trim()
    if (!q) return
    setFigmaSearching(true)
    const res = await searchFigmaLibrary({ q, limit: 12, mode: figmaMode, scan: 200 })
    setFigmaSearching(false)
    if (!res.success) {
      setError(('error' in res ? res.error : undefined) ?? '搜索失败')
      return
    }
    setFigmaResults(res.results)
    setFigmaNormalized(res.normalized ?? null)
  }

  async function onAddReferenceImages(files: File[]) {
    const max = 6
    const picks = files.slice(0, Math.max(0, max - referenceImages.length))
    if (picks.length === 0) return
    const readOne = (f: File) =>
      new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('read_failed'))
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
          if (!dataUrl) reject(new Error('empty_result'))
          else resolve({ name: f.name, dataUrl })
        }
        reader.readAsDataURL(f)
      })

    const items: Array<{ name: string; dataUrl: string }> = []
    for (const f of picks) {
      try {
        items.push(await readOne(f))
      } catch {
        // ignore
      }
    }
    if (items.length > 0) {
      setReferenceImages((prev) => [...prev, ...items])
      setImageInsight('')
    }
  }

  async function onAnalyzeReferenceImages() {
    if (referenceImages.length === 0) return
    if (analyzingImages) return
    setAnalyzingImages(true)
    const res = await analyzeImage({ dataUrl: referenceImages[0].dataUrl })
    setAnalyzingImages(false)
    if (!res.success) {
      setError(('error' in res ? res.error : undefined) ?? '图片识别失败')
      return
    }
    setImageInsight(res.text)
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <InputCard
            requirementText={requirementText}
            onChangeRequirementText={setRequirementText}
            styleHint={styleHint}
            onChangeStyleHint={setStyleHint}
            referenceUrlsText={referenceUrlsText}
            onChangeReferenceUrlsText={setReferenceUrlsText}
            referenceImages={referenceImages}
            onAddReferenceImageFiles={onAddReferenceImages}
            onRemoveReferenceImage={(index) => {
              setReferenceImages((prev) => prev.filter((_, i) => i !== index))
              setImageInsight('')
            }}
            imageInsight={imageInsight}
            analyzingImages={analyzingImages}
            onAnalyzeReferenceImages={onAnalyzeReferenceImages}
            mode={mode}
            onChangeMode={setMode}
            imageCount={imageCount}
            onChangeImageCount={setImageCount}
            onSubmit={onSubmit}
            onFillExample={onFillExample}
            onClear={onClear}
            disabled={stage !== 'idle'}
          />

          <ResultPanel
            task={task}
            taskId={taskId}
            loading={stage === 'polling'}
            error={error}
            shareUrl={shareUrl}
            onOpenTask={() => {
              if (!taskId) return
              navigate(`/tasks/${taskId}`)
            }}
            onRetry={() => {
              if (!taskId) return
              void poll(taskId)
            }}
          />

          <div className="rounded-xl border border-white/10 bg-[#111827] p-4 shadow-sm">
            <div className="text-sm font-semibold text-zinc-100">从 Figma 设计库搜索（可选）</div>
            <div className="mt-1 text-xs text-zinc-400">
              输入关键词搜索团队内文件名，点击“加入参考链接”会自动加入到本次参考图。
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={stage !== 'idle'}
                onClick={async () => {
                  setFigmaIndexLoading(true)
                  const r = await startFigmaIndex({ maxAnalyze: 20000, concurrency: 2 })
                  setFigmaIndexLoading(false)
                  if (!r.success) {
                    setError(('error' in r ? r.error : undefined) ?? '启动失败')
                    return
                  }
                  setFigmaIndex(r.status)
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {figmaIndexLoading ? '启动中…' : '全库AI打标（后台）'}
              </button>

              <button
                type="button"
                disabled={stage !== 'idle' || !figmaIndex?.running}
                onClick={async () => {
                  const r = await stopFigmaIndex()
                  if (!r.success) {
                    setError(('error' in r ? r.error : undefined) ?? '停止失败')
                    return
                  }
                  setFigmaIndex(r.status)
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                停止
              </button>

              <button
                type="button"
                disabled={stage !== 'idle'}
                onClick={async () => {
                  const r = await getFigmaIndexStatus()
                  if (!r.success) {
                    setError(('error' in r ? r.error : undefined) ?? '获取状态失败')
                    return
                  }
                  setFigmaIndex(r.status)
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                刷新进度
              </button>
            </div>

            {figmaIndex ? (
              <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-200">
                    状态：{figmaIndex.running ? '运行中' : figmaIndex.finishedAt ? '已完成' : '未启动'}
                  </span>
                  {figmaIndex.projectTotal != null ? <span>项目：{figmaIndex.projectDone ?? 0}/{figmaIndex.projectTotal}</span> : null}
                  {figmaIndex.fileTotal != null ? <span>文件：{figmaIndex.fileSeen ?? 0}/{figmaIndex.fileTotal}</span> : null}
                  {figmaIndex.fileAnalyzed != null ? <span>已打标：{figmaIndex.fileAnalyzed}</span> : null}
                  {figmaIndex.fileDeduped != null ? <span>去重复用：{figmaIndex.fileDeduped}</span> : null}
                  {figmaIndex.fileFailed != null ? <span>失败：{figmaIndex.fileFailed}</span> : null}
                </div>
                {figmaIndex.currentProject || figmaIndex.currentFile ? (
                  <div className="mt-1 text-zinc-400">
                    {figmaIndex.currentProject ? `项目：${figmaIndex.currentProject}` : ''}
                    {figmaIndex.currentFile ? ` · 文件：${figmaIndex.currentFile}` : ''}
                  </div>
                ) : null}
                {figmaIndex.lastError ? <div className="mt-1 text-rose-200">错误：{figmaIndex.lastError}</div> : null}
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <input
                value={figmaQuery}
                onChange={(e) => setFigmaQuery(e.target.value)}
                placeholder="例如：KV / 海报 / 直播 / 视觉 / 活动"
                disabled={stage !== 'idle'}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              />
              <button
                type="button"
                disabled={stage !== 'idle'}
                onClick={() => setFigmaMode((v) => (v === 'ai' ? 'name' : 'ai'))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {figmaMode === 'ai' ? 'AI 识图' : '文件名'}
              </button>
              <button
                type="button"
                disabled={stage !== 'idle' || figmaSearching || !figmaQuery.trim()}
                onClick={() => void onSearchFigma()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {figmaSearching ? '搜索中…' : '搜索'}
              </button>
            </div>

            {figmaResults.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {figmaNormalized?.tags?.length ? (
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                    Mapped tags: {figmaNormalized.tags.join(', ')}
                    {figmaNormalized.normalized && figmaNormalized.normalized !== figmaNormalized.original ? (
                      <span className="text-zinc-400"> · Normalized: {figmaNormalized.normalized}</span>
                    ) : null}
                  </div>
                ) : null}
                {figmaResults.slice(0, 6).map((r) => (
                  <div
                    key={r.fileUrl}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-100">{r.name}</div>
                      <div className="truncate text-xs text-zinc-400">{r.project ? `Figma｜${r.project}` : 'Figma'}</div>
                      {r.caption ? (
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-300">识别：{r.caption}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={stage !== 'idle'}
                      onClick={() => {
                        const next = [referenceUrlsText.trim(), r.fileUrl].filter(Boolean).join('\n')
                        setReferenceUrlsText(next)
                      }}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      加入参考链接
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
