import { Sparkles, Trash2, Wand2 } from 'lucide-react'
import { copyText } from '@/utils/clipboard'

export default function InputCard(props: {
  requirementText: string
  onChangeRequirementText: (v: string) => void
  styleHint: string
  onChangeStyleHint: (v: string) => void
  referenceUrlsText: string
  onChangeReferenceUrlsText: (v: string) => void
  referenceImages: Array<{ name: string; dataUrl: string }>
  onAddReferenceImageFiles: (files: File[]) => void
  onRemoveReferenceImage: (index: number) => void
  imageInsight: string
  onAnalyzeReferenceImages: () => void
  analyzingImages: boolean
  mode: 'generate' | 'revise'
  onChangeMode: (v: 'generate' | 'revise') => void
  imageCount: number
  onChangeImageCount: (v: number) => void
  onSubmit: () => void
  onFillExample: () => void
  onClear: () => void
  disabled: boolean
}) {
  const canSubmit = props.requirementText.trim().length > 0 && !props.disabled

  function pickImageFiles(items: ArrayLike<DataTransferItem> | null | undefined): File[] {
    if (!items) return []
    const out: File[] = []
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i]
      if (!it) continue
      if (it.kind !== 'file') continue
      if (!it.type || !it.type.startsWith('image/')) continue
      const f = it.getAsFile()
      if (f) out.push(f)
    }
    return out
  }

  function pickImageFilesFromFiles(list: FileList | null | undefined): File[] {
    if (!list || list.length === 0) return []
    return Array.from(list).filter((f) => f.type?.startsWith('image/'))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111827] p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">输入你的需求</div>
        <div className="mt-1 text-xs text-zinc-400">
          建议包含：目标用户 / 页面类型 / 功能点 / 风格
        </div>
      </div>

      <textarea
        value={props.requirementText}
        onChange={(e) => props.onChangeRequirementText(e.target.value)}
        onPaste={(e) => {
          const files = pickImageFiles(e.clipboardData?.items)
          if (files.length > 0) props.onAddReferenceImageFiles(files)
        }}
        onDrop={(e) => {
          e.preventDefault()
          const files = pickImageFilesFromFiles(e.dataTransfer?.files)
          if (files.length > 0) props.onAddReferenceImageFiles(files)
        }}
        onDragOver={(e) => e.preventDefault()}
        rows={10}
        placeholder="例如：为‘印加文明主题直播海报’做一套灵感收集 + 方案输出页面，要求深色高级感，支持分享链接。"
        disabled={props.disabled}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
      />

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2">
          <label className="text-xs text-zinc-400">模式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={props.disabled}
              onClick={() => props.onChangeMode('generate')}
              className={`rounded-lg border px-3 py-2 text-sm ${
                props.mode === 'generate'
                  ? 'border-indigo-500/60 bg-indigo-500/15 text-zinc-100'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
              } disabled:opacity-50`}
            >
              生成新方案
            </button>
            <button
              type="button"
              disabled={props.disabled}
              onClick={() => props.onChangeMode('revise')}
              className={`rounded-lg border px-3 py-2 text-sm ${
                props.mode === 'revise'
                  ? 'border-indigo-500/60 bg-indigo-500/15 text-zinc-100'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
              } disabled:opacity-50`}
            >
              基于参考图改版
            </button>
          </div>
          <div className="text-xs text-zinc-500">
            你可以上传上一期视觉/参考图，让 AI 先识图再生成。
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-zinc-400">参考图（可选，支持多张）</label>
          <div className="flex items-center justify-between gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={props.disabled}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  props.onAddReferenceImageFiles(Array.from(e.target.files))
                  e.target.value = ''
                }
              }}
              className="w-full text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-xs file:text-zinc-200 hover:file:bg-white/10 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={props.disabled || props.referenceImages.length === 0 || props.analyzingImages}
              onClick={props.onAnalyzeReferenceImages}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              {props.analyzingImages ? '识图中…' : '识别图片'}
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            支持拖拽图片到上方输入框，或直接 Ctrl/⌘+V 粘贴截图/图片。
          </div>

          {props.referenceImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {props.referenceImages.map((img, idx) => (
                <div key={`${img.name}-${idx}`} className="relative overflow-hidden rounded-lg border border-white/10">
                  <img src={img.dataUrl} alt={img.name} className="h-20 w-full object-cover" />
                  <button
                    type="button"
                    disabled={props.disabled}
                    onClick={() => props.onRemoveReferenceImage(idx)}
                    className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-[10px] text-zinc-100 hover:bg-black/70 disabled:opacity-50"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {props.imageInsight.trim() ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200">
              <div className="mb-1 flex items-center justify-between gap-2 text-zinc-400">
                <div>图片识别</div>
                <button
                  type="button"
                  disabled={props.disabled}
                  onClick={() => void copyText(props.imageInsight)}
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  复制
                </button>
              </div>
              <div className="whitespace-pre-wrap">{props.imageInsight}</div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-zinc-400">风格倾向</label>
          <input
            value={props.styleHint}
            onChange={(e) => props.onChangeStyleHint(e.target.value)}
            disabled={props.disabled}
            placeholder="极简 / 科技 / 企业 / 电商 …"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-zinc-400">参考链接（可选，一行一个）</label>
          <textarea
            value={props.referenceUrlsText}
            onChange={(e) => props.onChangeReferenceUrlsText(e.target.value)}
            rows={3}
            disabled={props.disabled}
            placeholder="粘贴 Pinterest / Behance / 案例页链接，例如：\nhttps://www.behance.net/gallery/...\nhttps://www.pinterest.com/pin/..."
            className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-zinc-400">参考图数量</label>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <input
              type="range"
              min={3}
              max={12}
              value={props.imageCount}
              disabled={props.disabled}
              onChange={(e) => props.onChangeImageCount(Number(e.target.value))}
              className="w-full"
            />
            <div className="w-10 text-right text-sm tabular-nums text-zinc-200">
              {props.imageCount}
            </div>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={props.onSubmit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            开始生成
          </button>

          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onFillExample}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            填充示例
          </button>

          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onClear}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            清空
          </button>
        </div>
      </div>
    </div>
  )
}
