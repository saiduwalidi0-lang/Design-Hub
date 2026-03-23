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
  body: JSON.stringify({ title: 'Docx Children Debug' }),
})
const createJson = await create.json()
const documentId = createJson?.data?.document?.document_id
console.log('documentId', documentId)

const childrenRes = await fetch(
  `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children?document_revision_id=-1&page_size=50`,
  {
    headers: { authorization: `Bearer ${token}` },
  },
)
const childrenJson = await childrenRes.json()
console.log('children', childrenRes.status)
console.log(JSON.stringify(childrenJson, null, 2).slice(0, 4000))

