import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResultPanel from './ResultPanel'
import type { DesignTask } from '@/types'

const baseTask: DesignTask = {
  id: 't1',
  requirementText: 'x',
  styleHint: 'y',
  imageCount: 6,
  status: 'succeeded',
  referenceImages: [],
  designSpecMarkdown: '# hi',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('ResultPanel', () => {
  it('renders empty state when no task', () => {
    render(
      <ResultPanel
        task={null}
        taskId={null}
        loading={false}
        error={null}
        shareUrl={null}
        onOpenTask={null}
        onRetry={null}
      />,
    )

    expect(
      screen.getByText('右侧会展示参考图与设计方案。先在左侧输入需求并开始生成。'),
    ).toBeInTheDocument()
  })

  it('renders error state', () => {
    render(
      <ResultPanel
        task={null}
        taskId={'t1'}
        loading={false}
        error={'boom'}
        shareUrl={null}
        onOpenTask={null}
        onRetry={() => {}}
      />,
    )

    expect(screen.getByText('生成失败')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('renders spec when tab switched', () => {
    const user = userEvent.setup()
    render(
      <ResultPanel
        task={baseTask}
        taskId={'t1'}
        loading={false}
        error={null}
        shareUrl={null}
        onOpenTask={null}
        onRetry={null}
      />,
    )

    return user
      .click(screen.getByRole('button', { name: '设计方案' }))
      .then(() => {
        expect(screen.getByRole('heading', { name: 'hi' })).toBeInTheDocument()
      })
  })
})
