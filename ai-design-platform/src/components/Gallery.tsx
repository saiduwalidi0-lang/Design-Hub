import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ReferenceImage } from '@/types'
import ImageModal from '@/components/ImageModal'

export default function Gallery({ images }: { images: ReferenceImage[] }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  const active = useMemo(() => images[index], [images, index])

  function openAt(i: number) {
    setIndex(i)
    setOpen(true)
  }

  function close() {
    setOpen(false)
  }

  function prev() {
    setIndex((v) => (v - 1 + images.length) % images.length)
  }

  function next() {
    setIndex((v) => (v + 1) % images.length)
  }

  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
        暂无参考图。可以尝试更具体的关键词，例如“行业 + 页面类型 + 风格”。
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <button
            type="button"
            key={`${img.url}-${i}`}
            onClick={() => openAt(i)}
            className="group overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left hover:border-white/20"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
              <img
                src={img.thumbnailUrl ?? img.url}
                alt={img.title ?? 'image'}
                className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
            <div className="grid gap-1 p-2">
              <div className="line-clamp-1 text-xs font-medium text-zinc-100">
                {img.title ?? '参考图'}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <div className="line-clamp-1">{img.source ?? ''}</div>
                  {img.generation ? (
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-200">
                      {img.generation === 'i2i'
                        ? 'I2I'
                        : img.generation === 't2i'
                          ? 'T2I'
                          : img.generation === 'user'
                            ? 'USER'
                            : img.generation}
                    </span>
                  ) : null}
                </div>
                <a
                  href={img.pageUrl ?? img.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
                >
                  <ExternalLink className="h-3 w-3" />
                  原图
                </a>
              </div>
            </div>
          </button>
        ))}
      </div>

      {open && active ? (
        <ImageModal
          open={open}
          image={active}
          index={index}
          total={images.length}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      ) : null}
    </>
  )
}
