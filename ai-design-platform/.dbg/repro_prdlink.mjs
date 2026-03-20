const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const base = process.env.API_BASE ?? 'http://127.0.0.1:3002'

const requirementText =
  '[SEA-Design Request] SEA Fest - SEA Championship April 2026\nhttps://bytedance.larkoffice.com/wiki/NTBZvM8Mbin5v8kvW2CzBKlNQR\n根据这个PRD生成KV方案'

const create = await fetch(`${base}/api/tasks`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    requirementText,
    styleHint: 'SEA Fest / 运动赛事 / 高级感',
    imageCount: 6,
  }),
})

const createText = await create.text().catch(() => '')
const created = JSON.parse(createText)
process.stdout.write(`create status=${create.status} body=${JSON.stringify(created)}\n`)

const id = created.taskId
if (!id) process.exit(1)

const start = Date.now()
while (Date.now() - start < 180_000) {
  const r = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`)
  const t = await r.text().catch(() => '')
  let j
  try {
    j = JSON.parse(t)
  } catch {
    process.stdout.write(`poll non-json status=${r.status} body=${t.slice(0, 120)}\n`)
    await sleep(800)
    continue
  }
  const task = j?.task
  process.stdout.write(
    `poll t=${Math.round((Date.now() - start) / 1000)}s status=${task?.status} stage=${task?.stage ?? ''} images=${task?.referenceImages?.length ?? 0}\n`,
  )
  if (task?.status === 'succeeded' || task?.status === 'failed') {
    process.stdout.write(`taskId=${id}\n`)
    break
  }
  await sleep(800)
}

