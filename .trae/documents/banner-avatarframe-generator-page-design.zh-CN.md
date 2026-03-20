# 页面设计文档：Banner + 头像框并行生成工具（Desktop-first）

## 全局设计规范

### Layout
- 桌面优先：内容容器 `max-width: 1160px` 居中。
- 主体采用“左侧配置 + 右侧预览”的两列布局（CSS Grid 或 Flexbox 均可）：左列 420–480px；右列自适应。
- 窄屏（< 960px）切换为上下堆叠：先配置后预览。
- 间距：8px 基准；区块间距 24px；卡片内边距 16–20px。

### Meta Information（通用）
- Title：Banner/头像框生成工具
- Description：一次 KV 输入，可勾选并行生成 Banner 与头像框；支持头像框三元素编辑、抠图与占位合并预览。
- Open Graph：og:title/og:description 同上；og:type=website

### Global Styles
- 背景色：浅色 `#F6F7FB`
- 主色（Primary）：`#4F46E5`
- 强调色（Accent）：`#22C55E`
- 危险色（Danger）：`#EF4444`
- 字体：系统字体栈；标题 24/20/16；正文 14/16
- 组件：卡片圆角 12px + 轻边框；Primary 按钮 hover 加深、disabled 降低不透明度并禁用点击

---

## 页面 1：制作页（/）

### 页面目标
完成“KV 输入 → 勾选输出（Banner/头像框）→（头像框编辑/抠图/占位合并）→ 生成 → 预览 → 下载”。

### Page Structure
- 顶部导航（横向）
- 主体两列：
  - 左列：KV 输入 + 输出勾选 +（Banner 参数）+（头像框编辑）+ 生成控制 + 状态提示
  - 右列：结果预览（Banner/头像框）+ 下载区

### Sections & Components
1. 顶部导航（Top Nav）
   - 左侧：产品名“生成工具”
   - 中部：Tab/Link（制作、设置）
   - 右侧：API 状态 Badge
     - 未配置：灰色“未配置 API Key”，点击跳转设置
     - 已配置：绿色“API Key 已配置”

2. KV 输入卡片（KV Input Card）
   - Dropzone：拖拽/点击上传
   - 校验提示：类型不支持/过大/读取失败
   - KV 预览：缩略图 + 文件名 + 尺寸（可读则显示）
   - 操作：更换、清除

3. 输出类型卡片（Output Selector Card）
   - Checkbox：生成 Banner、生成头像框（可同时勾选）
   - 提示文案：勾选后显示对应参数与结果区
   - 校验：至少勾选一项；否则“开始生成”按钮 disabled 并给出提示

4. Banner 参数卡片（Banner Params Card，仅勾选 Banner 时显示）
   - 目标尺寸只读：`3000 × 800`
   - 扩图方式 Select：按 API 支持展示（最少一个默认项）
   - 补充描述 Textarea（可选）

5. 头像框编辑卡片（Avatar Frame Editor Card，仅勾选头像框时显示）
   - 结构：左侧“小型画布预览（约 320×320）”，右侧“元素列表 + 控制面板”（桌面两列；窄屏上下）
   - 元素列表（固定三项）：
     - 元素 1：头像框主体（必填素材）
     - 元素 2：装饰/角标（可选素材）
     - 元素 3：文案/Logo（可选素材）
   - 每个元素的基础操作：上传/替换、显隐 Toggle、层级顺序（仅在三者间上移/下移）、重置
   - 基础变换控制（最小可用）：位置（X/Y）、缩放、旋转

6. 抠图与占位合并区（Cutout & Placeholder Composite）
   - 抠图按钮：对“占位头像/主体素材”执行抠图（用于预览合成）
   - 抠图状态：loading/成功/失败（失败给出重试）
   - 占位头像：
     - 默认：圆形示意头像
     - 可选：上传你的头像作为占位
   - 合并预览：将占位头像（抠图结果）与头像框进行合成展示，用于验收效果

7. 生成控制区（Generate Control）
   - Primary 按钮：开始生成
   - disabled 条件：未上传 KV / 未配置 Key / 未勾选输出 / 生成中
   - 生成策略提示：若同时勾选，UI 展示为“并行生成”（实现可并发或串行，但对你呈现为同时进行）

8. 状态与错误（Status Area）
   - 生成中：Spinner + 文案（分别标注 Banner/头像框的进度状态）
   - 失败：红色 Alert（支持展开查看详细错误）+ 重试

9. 结果预览区（Result Preview）
   - 结构：Tab（Banner 结果 / 头像框结果）或上下分区（当屏幕足够高时）
   - Banner 结果：固定 3000×800 比例容器等比缩放展示；支持放大预览弹层
   - 头像框结果：
     - “透明 PNG（仅框）”预览：棋盘格背景显示透明效果
     - “占位合并预览图”展示：用于快速确认上脸效果

10. 下载区（Download Area）
   - Banner：下载按钮（返回格式为 PNG/JPG 以实际为准）
   - 头像框：两个下载按钮
     - 下载透明 PNG（仅框）
     - 下载占位合并预览图
   - 文件名提示：包含类型与时间戳（如 avatar_frame_transparent_YYYYMMDD-HHmmss）

### Responsive Behavior
- < 960px：左/右两列改为上下堆叠；编辑器画布缩至 260×260；下载按钮改为全宽。

---

## 页面 2：设置页（/settings）

### 页面目标
让你配置图像生成/处理 API Key（不硬编码）并测试连接；必要时配置 API Endpoint。

### Page Structure
- 顶部导航（同制作页）
- 主体单列卡片：Key 配置卡 + Endpoint 卡 + 测试连接卡

### Sections & Components
1. API Key 配置卡（API Key Card）
   - 输入框（Password），支持显示/隐藏
   - 说明：Key 仅保存在本地浏览器
   - 操作：保存、清除（清除需二次确认）

2. API Endpoint 配置卡（Endpoint Card，可选）
   - 输入框：Base URL/Endpoint
   - 说明：用于切换不同供应商或自建网关

3. 测试连接卡（Test Connection Card）
   - 按钮：测试连接
   - 结果区：成功/失败与失败原因（未授权/配额不足/跨域等）

### Interaction States
- 未填写 API Key：保存按钮 disabled，并提示“请输入 API Key”。
- 测试连接中：按钮 loading 且不可重复点击；结果区显示进度。
