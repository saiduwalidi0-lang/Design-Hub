import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Download } from 'lucide-react'
import PageShell from '@/components/PageShell'
import ResultPanel from '@/components/ResultPanel'
import type { DesignTask } from '@/types'
import { getTask } from '@/utils/api'
import { copyText } from '@/utils/clipboard'
import { downloadText } from '@/utils/download'

export default function TaskDetail() {
  const { id } = useParams()
  const [task, setTask] = useState<DesignTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const shareUrl = useMemo(() => {
    if (!id) return null
    return `${window.location.origin}/tasks/${id}`
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!id) {
        setError('缺少任务ID')
        setLoading(false)
        return
      }

      setLoading(true)
      const res = await getTask(id)
      if (cancelled) return

      if (!res.success) {
        setError(('error' in res ? res.error : undefined) ?? '加载任务失败')
        setLoading(false)
        return
      }

      setTask(res.task)
      setError(null)
      setLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[960px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            返回生成工作台
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!shareUrl}
              onClick={async () => {
                if (!shareUrl) return
                await copyText(shareUrl)
              }}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              复制分享链接
            </button>

            <button
              type="button"
              disabled={!task?.designSpecMarkdown}
              onClick={() => {
                if (!task?.designSpecMarkdown) return
                downloadText(task.designSpecMarkdown, `design-spec-${task.id}.md`)
              }}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              下载 Markdown
            </button>
          </div>
        </div>

        <ResultPanel
          compact
          task={task}
          taskId={id ?? null}
          loading={loading}
          error={error}
          shareUrl={shareUrl}
          onOpenTask={null}
          onRetry={null}
        />
      </div>
    </PageShell>
  )
}
