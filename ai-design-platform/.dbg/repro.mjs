const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const base = process.env.API_BASE ?? 'http://127.0.0.1:3002'

const create = await fetch(`${base}/api/tasks`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    requirementText: 'Inca livestream poster gallery and spec',
    styleHint: '文化/梯田/深色',
    imageCount: 6,
  }),
})

const createText = await create.text().catch(() => '')
const created = JSON.parse(createText)
process.stdout.write(`create status=${create.status} body=${JSON.stringify(created)}\n`)

const id = created.taskId
if (!id) process.exit(1)

const start = Date.now()
while (Date.now() - start < 90_000) {
  const r = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`)
  const t = await r.text().catch(() => '')
  let j
  try {
    j = JSON.parse(t)
  } catch {
    process.stdout.write(`poll non-json status=${r.status} body=${t.slice(0, 120)}\n`)
    await sleep(600)
    continue
  }
  const task = j?.task
  process.stdout.write(
    `poll t=${Math.round((Date.now() - start) / 1000)}s status=${task?.status} stage=${task?.stage ?? ''} images=${task?.referenceImages?.length ?? 0}\n`,
  )
  if (task?.status === 'succeeded' || task?.status === 'failed') break
  await sleep(600)
}
