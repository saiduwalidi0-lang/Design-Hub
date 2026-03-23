const base = 'http://localhost:3002'

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

const createRes = await fetch(`${base}/api/tasks`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    requirementText: 'Create a simple event KV design plan for a gaming livestream campaign.',
    imageCount: 3,
  }),
})

const createJson = await createRes.json()
if (!createJson?.success) {
  console.log('create_failed', createRes.status, createJson)
  process.exit(1)
}

const taskId = createJson.taskId
console.log('taskId', taskId)

let task = null
for (let i = 0; i < 60; i++) {
  const r = await fetch(`${base}/api/tasks/${taskId}`)
  const j = await r.json()
  task = j?.task
  console.log('poll', i, task?.status, task?.stage)
  if (task?.status === 'succeeded' || task?.status === 'failed') break
  await sleep(2000)
}

if (!task || task.status !== 'succeeded') {
  console.log('task_not_succeeded')
  process.exit(1)
}

const docRes = await fetch(`${base}/api/feishu/docx/create_from_task`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ taskId }),
})
const docJson = await docRes.json()
console.log('doc', docRes.status, docJson)

