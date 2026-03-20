import { getTenantAccessToken } from './feishu.js'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

export type FeishuWikiSpace = {
  space_id: string
  name: string
}

export async function createWikiSpace(input: {
  name: string
  description?: string
}): Promise<FeishuWikiSpace> {
  const token = await getTenantAccessToken()

  const res = await fetch('https://open.feishu.cn/open-apis/wiki/v2/spaces', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? '',
    }),
  })

  const json = (await res.json().catch(() => null)) as any
  if (!res.ok || json?.code !== 0 || !json?.data?.space?.space_id) {
    const code = json?.code ?? res.status
    const msg = json?.msg ?? 'create_wiki_space_failed'
    throw new Error(`feishu_wiki_${code}_${msg}`)
  }

  return {
    space_id: json.data.space.space_id,
    name: json.data.space.name ?? input.name,
  }
}

export function getDefaultSpaceName(): string {
  return env('FEISHU_WIKI_SPACE_NAME') ?? 'AI 设计方案（独立空间）'
}

