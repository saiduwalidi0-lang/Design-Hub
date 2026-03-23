# Figma 插件：同步到 CMS — 页面设计文档（桌面优先）

## Global Styles（全局规范）
- Layout system: 以 Flexbox 为主，列表区域用 CSS Grid/stack（纵向卡片）。
- 画布/插件窗口尺寸建议：宽 360–420px，高 520–640px；内容区可滚动（overflow-y:auto）。
- Spacing: 4/8/12/16/24 递进；卡片内边距 12–16。
- Typography: 12/13/14/16（正文 13，表单 13，标题 14–16）。
- Colors（示例 token）
  - --bg: #FFFFFF；--panel: #F7F7F8；--text: #1F2328；--muted: #6A737D
  - --primary: #0D99FF（与 Figma 蓝接近）；--danger: #D1242F；--success:#1A7F37
  - Border: #E1E4E8；Divider: #ECEFF1
- Buttons
  - Primary：实心 primary；hover 加深 6–8%；disabled 降低不透明度 40%
  - Secondary：描边 + 透明底
  - Destructive：danger 色
- Inputs
  - 高度 32；focus ring：primary 2px
- Feedback
  - Toast：右下角/底部浮层（不遮挡主要按钮）；Inline error：输入框下方红字

## 1) 连接与鉴权（/connect）
### Meta Information
- Title: 连接到 CMS
- Description: 配置 CMS 地址并完成鉴权

### Page Structure
- 顶部：标题栏（返回/关闭可选）
- 主体：表单区（分组卡片）
- 底部：主操作区（固定在底部，避免被滚动吞没）

### Sections & Components
1. Header
   - 标题："连接与鉴权"
   - 右侧："帮助"链接（打开说明/指引文案，不强依赖外部页面）
2. CMS 环境卡片
   - 下拉：环境（生产/测试/自定义）
   - 输入：Base URL（仅自定义时启用）
   - Button："测试连接"（触发 /api/me）
   - 状态行：
     - 未测试：灰色提示
     - 成功：绿色 "已连接：<用户名>"
     - 失败：红色错误摘要 + "查看详情"（跳转 /logs 并定位错误）
3. 鉴权卡片
   - Radio：PAT / OAuth（默认 PAT；若你只实现一种，可隐藏另一个）
   - PAT 模式：
     - 输入：Token（password 类型，支持显示/隐藏）
     - Button："保存" / "更新"
   - OAuth 模式：
     - Button："在浏览器中授权"（显示步骤与回填提示）
     - 文案：说明回填 token 的方式与有效期
4. 安全与清除
   - Destructive Button："断开并清除凭证"
   - 说明：token 仅保存在本地（clientStorage），不上传到第三方

### Interaction States
- 测试连接 loading：按钮转圈 + 禁用表单
- 401/403：表单顶部显示 "鉴权失败/权限不足"，并突出 token 输入框

## 2) 同步面板（主页 /sync）
### Meta Information
- Title: 同步到 CMS
- Description: 选择目标与导出规则，一键同步

### Page Structure
- 顶部：选区摘要 + 连接状态
- 中部：目标选择、导出设置、预检结果
- 底部：主按钮（开始同步/取消）+ 进度条

### Sections & Components
1. Header（连接状态条）
   - 左：CMS 环境名 + 绿点（已连接）/黄点（未连接）
   - 右："设置"按钮（跳 /connect）
2. 选区摘要卡片
   - 主行："当前选区" + Refresh 图标
   - 内容：
     - 类型：Page / Frame / 多选 Frame
     - 数量：预计导出资源数
     - 说明：不支持的选区（如未选中任何节点）给出下一步提示
3. 目标选择卡片
   - 下拉：Space/站点（如适用）
   - 下拉：Folder/栏目/集合（如适用）
   - Button："刷新目标列表"
4. 导出与命名卡片
   - 下拉：格式（PNG/SVG/PDF）
   - 下拉：倍图（1x/2x）
   - Toggle："同名覆盖"（overwriteStrategy）
   - 文案：展示命名预览（使用节点名）
5. 预检与提示区（Inline banner）
   - 显示：预计总大小、是否超限、权限检查结果
   - 超限：给出建议（降低倍图/拆分同步）
6. 同步执行区
   - Primary Button："开始同步"
   - 同步中：按钮变为 "取消"（可中断后续上传）
   - 进度：
     - Progress bar + 文案："正在上传 3/10"
     - 小列表：最近 3 条资源状态（成功/失败/进行中）
7. 完成摘要（同步结束后出现）
   - 成功/失败/跳过计数
   - Button："查看详情"（跳 /logs 并定位 jobId）

### Error UX
- 批次部分失败：不弹阻塞式对话框；在摘要区给出失败条目数与入口。
- 429/timeout：在进度区提示 "网络波动，正在重试（1/3）"。

## 3) 同步记录与错误详情（/logs）
### Meta Information
- Title: 同步记录
- Description: 查看历史任务与失败原因

### Page Structure
- 左/上：任务列表
- 右/下：任务详情（在窄窗口下改为上下结构）

### Sections & Components
1. 任务列表（List）
   - 行信息：时间、目标位置、选区摘要、成功率
   - 状态徽章：Success/Partial/Failed
   - 支持：最多保留最近 N 条（例如 20），可清空
2. 任务详情（Detail）
   - 摘要：jobId、耗时、版本号、重试次数
   - 逐项表（Table / list rows）：
     - 列：节点名、格式、状态、assetId（可复制）、操作
     - 操作："重试"（仅 failed 且 retriable）
3. 错误详情抽屉/Modal
   - 展示：错误码、原始 HTTP 状态码、CMS message、建议处理
   - Button："复制诊断信息"（JSON）

### Interaction States
- 过滤：仅看失败项（toggle）
- 重试：单项重试后更新该行状态，并在顶部显示 toast
