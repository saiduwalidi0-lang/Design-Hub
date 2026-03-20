const url = 'https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-descendant/create.md.md'
const res = await fetch(url, { headers: { accept: 'text/markdown,*/*;q=0.8' } })
console.log('status', res.status)
const text = await res.text()
console.log(text.slice(0, 4000))
