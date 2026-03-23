# 页面设计文档：上传头图并扩图为 3000x800 Banner 小工具（Desktop-first）

## 全局设计规范

### Layout
- 桌面优先：内容容器 `max-width: 1100px`，居中；两列布局用于“上传/参数”与“预览/结果”。
- 使用 Flexbox 为主：主区域左右两列；在窄屏（< 900px）改为上下堆叠。
- 间距：基准 8px；区块间距 24px；卡片内边距 16px。

### Meta Information（通用）
- Title：扩图 Banner 工具 | 3000×800
- Description：上传头图，一键调用生图 API 扩图为 3000×800 横幅并下载。
- Open Graph：
  - og:title 同 Title
  - og:description 同 Description
  - og:type：website

### Global Styles
- 背景色：`#0B1020`（深色）或 `#F6F7FB`（浅色，可二选一固定）
- 主色（Primary）：`#4F46E5`
- 强调色（Accent）：`#22C55E`
- 危险色（Danger）：`#EF4444`
- 字体：系统字体栈；标题 24/20/16，正文 14/16
- 按钮：
  - Primary：实心主色；hover 加深 8%；disabled 降低不透明度并禁用点击
  - Secondary：描边/浅底
- 链接：主色下划线 hover 显示
- 卡片：圆角 12px；阴影轻量；边框 `rgba(0,0,0,0.08)`（浅色主题）或 `rgba(255,255,255,0.12)`（深色主题）

---

## 页面 1：制作页（/）

### 页面目标
完成“上传头图 → 调用生图 API 扩图到 3000×800 → 预览 → 下载”。

### Page Structure
- 顶部导航（横向）
- 主体区域（两列）：
  - 左列：上传 + 参数 + 生成按钮 + 状态提示
  - 右列：结果预览（空态/生成中/成功/失败）+ 下载

### Sections & Components
1. 顶部导航（Top Nav）
   - 左侧：产品名“Banner 扩图工具”
   - 中部：Tab/Link（制作、设置）
   - 右侧：API 状态 Badge
     - 未配置：灰色“未配置 API Key”并可点击跳转设置
     - 已配置：绿色“API Key 已配置”

2. 上传卡片（Upload Card）
   - 拖拽上传区域（Dropzone）
     - 文案：“拖拽图片到此处，或点击选择文件”
     - 支持点击打开文件选择器
   - 校验提示（inline alert）
     - 类型不支持 / 文件过大 / 读取失败
   - 原图预览（缩略图）
   - 原图信息：文件名、原始尺寸（若可读取）、文件大小
   - 操作：更换图片、清除

3. 参数卡片（Params Card）
   - 固定展示：目标尺寸 `3000 × 800`（只读）
   - 扩图方式（Select）
     - 默认选项：智能补全（若 API 不支持，可仅保留一个选项）
   - 补充描述（Textarea，可选）
     - placeholder：例如“补全背景为天空与城市天际线，风格自然”
   - 生成按钮（Primary）
     - 文案：生成 Banner
     - disabled 条件：未上传图片 / 未配置 Key / 生成中

4. 状态与错误（Status Area）
   - 生成中：Spinner + 文案“正在生成，请稍候…”
   - 失败：红色 Alert
     - 显示：错误概要 +（可折叠）详细信息
     - 操作：重试（保持参数不丢失）

5. 结果预览卡片（Result Preview Card）
   - 空态：插画/占位框 + 引导文案
   - 成功态：
     - 结果图展示：固定 3000×800 比例的预览容器（等比缩放展示）
     - 操作：放大预览（弹层）
     - 元信息（若有）：耗时、返回格式

6. 下载区（Download Area）
   - 下载按钮（Primary/Secondary）
     - 文案：下载 PNG/JPG（以实际返回为准）
     - 生成文件名规则提示（小字）

### Responsive Behavior
- < 900px：两列变单列；结果预览移动到参数卡片下方；顶部导航 Tab 变为下拉或保持横向滚动。

---

## 页面 2：设置页（/settings）

### 页面目标
让你配置生图 API Key（不硬编码）并可测试连接；必要时配置 API Endpoint。

### Page Structure
- 顶部导航（同制作页）
- 主体单列卡片堆叠：Key 配置卡 + Endpoint 卡 + 测试连接卡

### Sections & Components
1. API Key 配置卡（API Key Card）
   - 输入框（Password 类型，支持显示/隐藏）
   - 说明文案：Key 仅保存在本地浏览器，不会写入代码仓库
   - 操作按钮：保存、清除
   - 保存反馈：Toast（保存成功/失败）

2. API Endpoint 配置卡（Endpoint Card，可选）
   - 输入框：Base URL/Endpoint
   - helper 文案：用于切换不同供应商或自建网关

3. 测试连接卡（Test Connection Card）
   - 按钮：测试连接
   - 结果区：
     - 成功：绿色提示“连接成功”
     - 失败：红色提示并展示原因（例如：未授权/配额不足/跨域）

### Interaction States
- 当 API Key 未填写：保存按钮 disabled，并提示“请输入 API Key”。
- 清除 Key：二次确认（小型确认弹层）。

### Responsive Behavior
- 移动端保持单列；输入框与按钮垂直堆叠；提示信息换行显示。