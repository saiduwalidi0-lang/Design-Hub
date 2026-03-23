把头像框默认素材放在这个目录即可生效（优先读取图片文件，其次读取 `defaults.json`）。

**推荐方式：直接放图片文件（无需改 JSON）**
- 主元素（element1）：`main.png` 或 `element1.png`
- 环绕元素（element2）：`surround.png` 或 `element2.png`
- 顶部元素（element3）：`top.png` 或 `element3.png`

注意：文件名不要出现重复扩展名（例如 `top.png.png`），应为 `top.png`。

支持扩展名：`.png` / `.webp` / `.jpg` / `.jpeg`

**可选：defaults.json**
- `order`：图层合并顺序（从下到上绘制），例如 `{"order":["element1","element2","element3"]}`
- `elements.*.dataUrl`：也可以填 `data:image/...;base64,...` 作为兜底
