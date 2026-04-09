把头像框默认素材放在这个目录即可生效（优先读取图片文件，其次读取 `defaults.json`）。

**推荐方式：直接放图片文件（无需改 JSON）**（仅对 **`avatar-frame-defaults/` 根目录** 自动探测；子目录如 `sets/group-2/` 必须在 `defaults.json` 里写 `src`）

- 主元素（element1）：`main.png` / `element1.png`，或数字导出 **`3.png`**
- 环绕元素（element2）：`surround.png` / `element2.png`，或 **`6.png`**
- 顶部元素（element3）：`top.png` / `element3.png`，或 **`5.png`**
- 圆环（element4，可选）：`ring.png` / `element4.png`，或 **`4.png`**

若你手里的素材只有 `3.png`、`5.png`、`6.png` 这类命名：**要么** 按上表改名为语义文件名，**要么** 在 `defaults.json` 对应组的 `elements` 里显式写 `"src": "你的子目录/5.png"` 等（避免和别的团队导出习惯冲突时，以 JSON 为准）。

注意：文件名不要出现重复扩展名（例如 `top.png.png`），应为 `top.png`。

支持扩展名：`.png` / `.webp` / `.jpg` / `.jpeg`

**可选：defaults.json**
- `order`：图层合并顺序（从下到上绘制），例如 `{"order":["element1","element2","element3"]}`
- `elements.*.dataUrl`：也可以填 `data:image/...;base64,...` 作为兜底
