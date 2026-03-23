export type DesignTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type DesignTaskStage = 'generating_spec' | 'generating_kv' | 'searching_images'

export type ReferenceImage = {
  url: string
  title?: string
  source?: string
  thumbnailUrl?: string
  pageUrl?: string
  author?: string
  license?: string
  prompt?: string
  imageSize?: string
  generation?: 't2i' | 'i2i' | 'user' | 'search'
  usedReference?: boolean
  referenceName?: string
}

export type ImageSearchAttempt = {
  direction?: string
  query: string
  ok: boolean
  status?: number
  pagesCount?: number
  durationMs?: number
  errorMessage?: string
}

export type DesignTaskDebug = {
  imageSearch?: {
    attempts: ImageSearchAttempt[]
    chosenQuery?: string
    directionQueries?: Record<string, string[]>
  }
}

export type DesignTask = {
  id: string
  requirementText: string
  styleHint?: string
  imageCount: number
  status: DesignTaskStatus
  stage?: DesignTaskStage
  referenceImages: ReferenceImage[]
  designSpecMarkdown: string
  errorMessage?: string
  debug?: DesignTaskDebug
  createdAt: string
  updatedAt: string
}

export type CreateTaskInput = {
  requirementText: string
  styleHint?: string
  imageCount: number
  referenceUrls?: string[]
  mode?: 'generate' | 'revise'
  referenceImageDataUrls?: string[]
}
