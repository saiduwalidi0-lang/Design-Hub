import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import type { ReferenceImage } from '@/types'
import { copyText } from '@/utils/clipboard'

export default function ImageModal(props: {
  open: boolean
  image: ReferenceImage
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    if (!props.open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose()
      if (e.key === 'ArrowLeft') props.onPrev()
      if (e.key === 'ArrowRight') props.onNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props])

  if (!props.open) return null

  const link = props.image.pageUrl ?? props.image.url
  const gen = props.image.generation
  const genText =
    gen === 'i2i' ? '图生图（I2I）' : gen === 't2i' ? '文生图（T2I）' : gen === 'user' ? '用户上传' : gen ? gen : ''

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="w-full max-w-[980px] overflow-hidden rounded-xl border border-white/10 bg-[#0B0F19] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {props.image.title ?? '预览'}
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">
              {props.index + 1} / {props.total}
              {props.image.source ? ` · ${props.image.source}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <ExternalLink className="h-4 w-4" />
              打开原图
            </a>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 hover:bg-white/10"
              onClick={props.onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative bg-black/30">
          <img
            src={props.image.url}
            alt={props.image.title ?? 'image'}
            className="mx-auto max-h-[72vh] w-auto select-none object-contain"
          />

          <button
            type="button"
            onClick={props.onPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/30 p-2 text-zinc-100 backdrop-blur hover:bg-black/40"
            aria-label="上一张"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={props.onNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/30 p-2 text-zinc-100 backdrop-blur hover:bg-black/40"
            aria-label="下一张"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-1 px-4 py-3 text-xs text-zinc-400">
          {genText ? <div>生成方式：{genText}</div> : null}
          {props.image.usedReference ? (
            <div>
              使用参考图：是{props.image.referenceName ? `（${props.image.referenceName}）` : ''}
            </div>
          ) : null}
          {props.image.imageSize ? <div>尺寸：{props.image.imageSize}</div> : null}
          {props.image.author ? <div>作者：{props.image.author}</div> : null}
          {props.image.license ? <div>许可：{props.image.license}</div> : null}

          {props.image.prompt ? (
            <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-zinc-300">
                <div className="text-xs">生成提示词</div>
                <button
                  type="button"
                  onClick={async () => {
                    await copyText(props.image.prompt || '')
                  }}
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-200 hover:bg-white/10"
                >
                  复制
                </button>
              </div>
              <div className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-200">
                {props.image.prompt}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
