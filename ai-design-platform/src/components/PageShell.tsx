import type { ReactNode } from 'react'
import { BookOpenText } from 'lucide-react'

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30" />
            <div>
              <div className="text-sm font-semibold tracking-wide">设计助手</div>
              <div className="text-xs text-zinc-400">输入需求，自动搜图并生成结构化设计方案</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              href="/cms"
            >
              CMS
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              href="https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpenText className="h-4 w-4" />
              使用说明
            </a>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
