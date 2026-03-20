const url = 'https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-descendant/create'

const res = await fetch(url)
console.log('status', res.status)
const html = await res.text()
console.log('len', html.length)

const hit = html.match(/descendant[\s\S]{0,2000}children[\s\S]{0,2000}/i)
if (hit) {
  console.log(hit[0].slice(0, 4000))
} else {
  console.log(html.slice(0, 2000))
}

