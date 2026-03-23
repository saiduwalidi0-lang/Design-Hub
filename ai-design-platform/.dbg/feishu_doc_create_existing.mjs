const base = 'http://localhost:3002'
const taskId = '270047dd-2328-423e-ac7a-b145f970e5cb'

const r = await fetch(`${base}/api/feishu/docx/create_from_task`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ taskId }),
})

console.log('status', r.status)
console.log(await r.text())

