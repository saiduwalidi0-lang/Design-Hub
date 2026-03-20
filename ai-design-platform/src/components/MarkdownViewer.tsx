import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MarkdownViewer({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-indigo-300 prose-a:no-underline hover:prose-a:underline prose-table:block prose-table:overflow-x-auto prose-th:text-zinc-200 prose-td:text-zinc-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}

