import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { cmsDedupeFigmaCaptions, cmsDeleteFigmaCaption, cmsListFigmaCaptions, cmsUpdateFigmaCaption } from '@/utils/api'

type Item = {
  fileKey: string
  fileName: string
  projectName?: string
  fileUrl: string
  thumbnailUrl?: string
  lastModified?: string
  imageHash?: string
  caption: string
  captionAt: string
}

export default function Cms() {
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(30)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [dedupeMsg, setDedupeMsg] = useState<string | null>(null)

  const page = useMemo(() => Math.floor(offset / Math.max(1, limit)) + 1, [offset, limit])
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / Math.max(1, limit))), [total, limit])

  async function refresh(next?: { offset?: number }) {
    setLoading(true)
    setError(null)
    const res = await cmsListFigmaCaptions({ q: q.trim() || undefined, offset: next?.offset ?? offset, limit })
    setLoading(false)
    if (!res.success) {
      setError(('error' in res ? res.error : undefined) ?? '请求失败')
      return
    }
    setTotal(res.total)
    setItems(res.items as any)
  }

  useEffect(() => {
    setOffset(0)
    setLoading(true)
    setError(null)
    void (async () => {
      const res = await cmsListFigmaCaptions({ offset: 0, limit })
      setLoading(false)
      if (!res.success) {
        setError(('error' in res ? res.error : undefined) ?? '请求失败')
        return
      }
      setTotal(res.total)
      setItems(res.items as any)
    })()
  }, [])

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-100">Local CMS</div>
            <div className="text-xs text-zinc-400">Manage thumbnails and labels stored locally in `api/data/figma_captions.json`.</div>
          </div>
          <a
            href="/"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Back
          </a>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#111827] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fileName/project/caption"
              className="w-full max-w-md rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={() => {
                setOffset(0)
                void refresh({ offset: 0 })
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={async () => {
                setDedupeMsg(null)
                const dry = await cmsDedupeFigmaCaptions({ dryRun: true })
                if (!dry.success) {
                  setError(('error' in dry ? dry.error : undefined) ?? '请求失败')
                  return
                }
                if (!window.confirm(`Found ${dry.duplicates} duplicates by imageHash. Remove ${dry.removed}?`)) return
                const applied = await cmsDedupeFigmaCaptions({ dryRun: false })
                if (!applied.success) {
                  setError(('error' in applied ? applied.error : undefined) ?? '请求失败')
                  return
                }
                setDedupeMsg(`Removed ${applied.removed} duplicates.`)
                void refresh({ offset: 0 })
                setOffset(0)
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Dedupe (by imageHash)
            </button>

            <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
              <span>
                {total} items · Page {page}/{totalPages}
              </span>
              <select
                value={limit}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setLimit(n)
                  setOffset(0)
                  void refresh({ offset: 0 })
                }}
                className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-100"
              >
                {[20, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
          {dedupeMsg ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {dedupeMsg}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="bg-black/20">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-200">Thumb</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-200">File</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-200">Caption</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isEditing = editing[it.fileKey] != null
                  const value = isEditing ? editing[it.fileKey] : ''
                  return (
                    <tr key={it.fileKey} className="border-t border-white/10 align-top">
                      <td className="w-[140px] px-3 py-3">
                        {it.thumbnailUrl ? (
                          <a href={it.fileUrl} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={it.thumbnailUrl}
                              alt={it.fileName}
                              className="h-20 w-32 rounded-md border border-white/10 object-cover"
                            />
                          </a>
                        ) : (
                          <div className="h-20 w-32 rounded-md border border-white/10 bg-black/20" />
                        )}
                        <div className="mt-2 text-[10px] text-zinc-500">{it.imageHash ? it.imageHash.slice(0, 10) : 'no-hash'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm text-zinc-100">
                          <a href={it.fileUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            {it.fileName}
                          </a>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">{it.projectName ?? '—'}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">captionAt: {it.captionAt}</div>
                        {it.lastModified ? <div className="mt-1 text-[11px] text-zinc-500">lastModified: {it.lastModified}</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <textarea
                            value={value}
                            onChange={(e) => setEditing((m) => ({ ...m, [it.fileKey]: e.target.value }))}
                            rows={8}
                            className="w-[520px] min-w-[320px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-100 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        ) : (
                          <div className="w-[520px] min-w-[320px] whitespace-pre-wrap text-xs text-zinc-200">{it.caption}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={Boolean(saving[it.fileKey]) || !value.trim()}
                                onClick={async () => {
                                  setSaving((m) => ({ ...m, [it.fileKey]: true }))
                                  const r = await cmsUpdateFigmaCaption({ fileKey: it.fileKey, caption: value })
                                  setSaving((m) => ({ ...m, [it.fileKey]: false }))
                                  if (!r.success) {
                                    setError(('error' in r ? r.error : undefined) ?? '请求失败')
                                    return
                                  }
                                  setEditing((m) => {
                                    const next = { ...m }
                                    delete next[it.fileKey]
                                    return next
                                  })
                                  void refresh()
                                }}
                                className="rounded-lg border border-white/10 bg-emerald-500/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                              >
                                {saving[it.fileKey] ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing((m) => {
                                    const next = { ...m }
                                    delete next[it.fileKey]
                                    return next
                                  })
                                }
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditing((m) => ({ ...m, [it.fileKey]: it.caption }))}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                            >
                              Edit
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`Delete caption for ${it.fileName}?`)) return
                              const r = await cmsDeleteFigmaCaption(it.fileKey)
                              if (!r.success) {
                                setError(('error' in r ? r.error : undefined) ?? '请求失败')
                                return
                              }
                              void refresh()
                            }}
                            className="rounded-lg border border-white/10 bg-rose-500/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/30"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={loading || offset <= 0}
              onClick={() => {
                const next = Math.max(0, offset - limit)
                setOffset(next)
                void refresh({ offset: next })
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={loading || offset + limit >= total}
              onClick={() => {
                const next = offset + limit
                setOffset(next)
                void refresh({ offset: next })
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
