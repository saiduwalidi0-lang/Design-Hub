import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const appId = process.env.FEISHU_APP_ID
const appSecret = process.env.FEISHU_APP_SECRET

async function tenantToken() {
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const j = await r.json()
  if (j.code !== 0) throw new Error(JSON.stringify(j))
  return j.tenant_access_token
}

const token = await tenantToken()

const create = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Docx Descendant Debug' }),
})
const createJson = await create.json()
console.log('create', create.status, createJson)
const documentId = createJson?.data?.document?.document_id

const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/descendant?document_revision_id=-1`
console.log('descendant_url', url)

for (const body of [
  { children_id: [], descendants: [{ block_type: 2 }] },
  { children_id: [''], descendants: [{ block_type: 2 }] },
  { children_id: ['0'], descendants: [{ block_type: 2 }] },
  { children_id: [documentId], descendants: [{ block_type: 2 }] },
]) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  const fv = j?.error?.field_violations
  if (fv) {
    console.log('try', body, '=>', r.status, j.code, j.msg, JSON.stringify(fv, null, 2))
  } else {
    console.log('try', body, '=>', r.status, j)
  }
}
