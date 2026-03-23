import type { CreateTaskInput, ReferenceImage } from '../types.js'
import { clampText } from './text.js'

function toBulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}

type Direction = {
  name: string
  tagline: string
  keywords: string[]
  storytelling: string
  palette: { name: string; hex: string; usage: string }[]
  typography: string[]
  motifs: string[]
  texture: string[]
  composition: string[]
  imageQueries: string[]
}

function normalizeText(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTopic(input: CreateTaskInput): string {
  const raw = `${input.requirementText}\n${input.styleHint ?? ''}`

  const quoted = raw.match(/[“"《【](.{2,40}?)[”"》】]/)
  if (quoted?.[1]) return normalizeText(quoted[1])

  const topic1 = raw.match(/主题\s*[:：]?\s*([^\n。；;]{2,40})/)
  if (topic1?.[1]) return normalizeText(topic1[1])

  const topic2 = raw.match(/([\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9\s]{1,30}?)\s*主题/)
  if (topic2?.[1]) return normalizeText(topic2[1])

  const firstLine = (input.requirementText.split(/\r?\n/)[0] ?? '').trim()
  const cleaned = firstLine
    .replace(/^\s*(做一个|做|为|设计|生成|创建)\s*/g, '')
    .replace(/\s*(页面|平台|系统)\s*$/g, '')
    .trim()

  return normalizeText(cleaned || input.styleHint || '主题未识别')
}

export type VisualDirection = Direction

function isIncaTheme(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes('inca') ||
    t.includes('machu') ||
    t.includes('picchu') ||
    text.includes('印加') ||
    text.includes('马丘比丘') ||
    text.includes('安第斯')
  )
}

export function buildVisualDirections(input: CreateTaskInput): Direction[] {
  const hint = `${input.requirementText} ${input.styleHint ?? ''}`
  const topic = extractTopic(input)

  if (isIncaTheme(hint)) {
    return [
      {
        name: 'Surging Terraces｜梯田浪涌',
        tagline: '石墙与梯田的节奏线条，构成史诗级山地文明的能量流。',
        keywords: ['梯田', '石墙肌理', '史诗尺度', '云雾层次', '翠绿与石灰灰', '金色点缀'],
        storytelling:
          '以“山势—梯田—遗址”三层叙事组织画面：远景强调地貌与云雾，中景突出梯田的节奏，近景用作物与花束建立文化温度。整体光感偏高对比但克制，让主题既神秘又可信。',
        palette: [
          { name: 'Night Slate', hex: '#0B0F19', usage: '背景/大面积底色' },
          { name: 'Stone Gray', hex: '#6B7280', usage: '石墙/分割线/次要文字' },
          { name: 'Terrace Green', hex: '#22C55E', usage: '梯田绿/强调区域' },
          { name: 'Corn Gold', hex: '#F59E0B', usage: '金色点缀/高光/徽章' },
          { name: 'Cochenille Red', hex: '#EF4444', usage: '仪式红/小面积强调' },
        ],
        typography: ['标题：高对比粗体无衬线', '正文：中性系统字体，行距略大', '数字/时间：等宽或半等宽增强“工具感”'],
        motifs: ['梯田台阶线条（可做底纹/边框）', '玉米穗/藜麦花序的抽象图标', '坎图塔花形的点缀符号'],
        texture: ['石材粗粝纹理（低透明叠加）', '织物编织纹（局部作为边框/角标）', '轻微胶片颗粒或雾化渐变'],
        composition: ['主视觉：遗址/梯田大景 + 前景作物静物', '信息层级：标题最大，其次时间/卖点，CTA 用金色或绿色', '用“台阶线”做分区，让信息像被梯田承托'],
        imageQueries: [
          'Machu Picchu terraces',
          'Inca agricultural terraces',
          'Sacred Valley Peru terraces',
          'Andean potatoes quinoa corn still life',
        ],
      },
      {
        name: 'Sacred Textile｜圣织几何',
        tagline: '以织物纹样与几何符号建立强识别的文化系统。',
        keywords: ['几何纹样', '织物边框', '高对比黑金', '符号化植物', '图腾感', '版画质感'],
        storytelling:
          '把文化信息从“写实风景”转为“符号系统”：用织物几何作为画面框架，把主题植物（玉米/藜麦/土豆/坎图塔）提炼为图标，形成可复用的视觉语法。适合系列化海报与直播间贴片。',
        palette: [
          { name: 'Deep Black', hex: '#0A0A0A', usage: '底色/大面积' },
          { name: 'Warm Gold', hex: '#D4AF37', usage: '主高光/奖章/标题点缀' },
          { name: 'Textile Red', hex: '#B91C1C', usage: '纹样/强调' },
          { name: 'Bone White', hex: '#F3F4F6', usage: '文字/留白块' },
          { name: 'Andes Blue', hex: '#2563EB', usage: '少量冷色平衡' },
        ],
        typography: ['标题：几何无衬线，字距略紧', '辅助：小型大写/窄体用于标签', '强调字：可用描边或反白块增强图腾感'],
        motifs: ['印加织物几何（菱形/台阶/阶梯纹）', '太阳/山峰/台阶的抽象符号', '作物图标组（可做贴纸）'],
        texture: ['丝网印刷颗粒', '纸张纤维感', '金属箔光泽（仅小面积）'],
        composition: ['画面框架：左右/上下边框承载纹样', '主标题居中或对齐边框网格', '图片作为“纹样窗口”，用少量但强势'],
        imageQueries: [
          'Inca textile pattern',
          'Tocapu pattern',
          'Andean textile geometric pattern',
          'Inca iconography symbols',
        ],
      },
      {
        name: 'Mist & Botany｜云雾植谱',
        tagline: '更偏自然与植物学的高质感情绪，适合温和高级调性。',
        keywords: ['云雾渐变', '植物学标本', '柔光', '低饱和', '纸感', '留白'],
        storytelling:
          '用云雾与柔光降低遗址的“旅游照感”，把重点放在植物与材质：玉米与藜麦的形态、土豆的色谱、石墙的质感。整体信息密度更松，适合做品牌感直播海报。',
        palette: [
          { name: 'Fog Gray', hex: '#111827', usage: '深色背景/氛围' },
          { name: 'Sage', hex: '#84CC16', usage: '植物绿/点缀' },
          { name: 'Clay', hex: '#A16207', usage: '土色/材质' },
          { name: 'Mist White', hex: '#E5E7EB', usage: '文字/雾化层' },
          { name: 'Berry', hex: '#BE123C', usage: '花/小面积提亮' },
        ],
        typography: ['标题：更克制的粗体，配合大留白', '正文：更高行距，强调“说明书/标本卡”感觉', '标签：小字号大写/等宽提升理性气质'],
        motifs: ['植物线描（玉米/藜麦/坎图塔）', '地形等高线或梯田线', '标注式 UI（编号/小标签/来源）'],
        texture: ['柔雾渐变遮罩', '轻纸张纹', '水彩晕染（极轻）'],
        composition: ['主画面留白更大，文字在雾化层上', '植物作为角标或信息承托', '参考图采用“拼贴标本板”形式'],
        imageQueries: [
          'Cantuta flower',
          'Chenopodium quinoa inflorescence',
          'Andean botanical illustration',
          'Puya raimondii',
        ],
      },
    ]
  }

  const s = (input.styleHint ?? '').toLowerCase()
  const isMinimal = s.includes('极简') || s.includes('minimal')
  const isTech = s.includes('科技') || s.includes('tech')
  const isCommerce = s.includes('电商') || s.includes('commerce')

  const base: Direction[] = [
    {
      name: 'Core Atmosphere｜核心氛围',
      tagline: `围绕“${topic}”先定主情绪与材质，再统一图片、文字与色彩的“同一口气”。`,
      keywords: [topic, '主题一致性', '材质与光感', '色彩主次', '符号系统', '叙事线索'],
      storytelling:
        `把需求拆成“主题对象 + 场景语境 + 情绪强度 + 品牌气质”四个变量：先锁定“${topic}”做锚点，其余作为细节补充，避免画面信息散。`,
      palette: [
        { name: 'Background', hex: '#0B0F19', usage: '背景' },
        { name: 'Primary', hex: isTech ? '#6366F1' : isCommerce ? '#F43F5E' : '#6366F1', usage: '主色/强调' },
        { name: 'Accent', hex: isTech ? '#22D3EE' : isCommerce ? '#F59E0B' : '#22C55E', usage: '点缀/高光' },
        { name: 'Text', hex: '#E5E7EB', usage: '正文/反白' },
      ],
      typography: [
        isMinimal ? '标题：克制的粗体无衬线，字距略松' : '标题：高对比粗体无衬线',
        '正文：中性易读字体，行距略大',
        '数字与标签：等宽或半等宽增强秩序',
      ],
      motifs: ['可复用的几何形/线条系统', `主题对象的抽象图标（围绕“${topic}”提炼）`, '角标/徽章/标签体系'],
      texture: ['轻颗粒', '渐变雾化', '材质纹理（纸/金属/玻璃，按主题选择）'],
      composition: ['主标题 + 一句话主叙事', '信息按 3 层分区：主视觉/要点/行动', '图片与文字保持统一的对齐网格'],
      imageQueries: [
        `${topic} poster`,
        `${topic} moodboard`,
        `${topic} visual identity`,
        input.styleHint ? `${topic} ${input.styleHint} poster` : `${topic} poster design`,
      ],
    },
  ]

  if (isMinimal) {
    base.push({
      name: 'Minimal System｜极简系统',
      tagline: '少元素、强秩序：用留白与排版做高级感。',
      keywords: ['留白', '对齐', '弱化装饰', '单一主色', '高质感字体'],
      storytelling:
        '用“一个主视觉 + 一组标签 + 一句核心承诺”建立信息结构，减少多图堆叠；用材质与微弱渐变控制氛围，避免空。',
      palette: [
        { name: 'Paper Black', hex: '#0A0A0A', usage: '底色' },
        { name: 'Off White', hex: '#F3F4F6', usage: '文字/留白' },
        { name: 'Indigo', hex: '#6366F1', usage: '主强调' },
        { name: 'Zinc', hex: '#A1A1AA', usage: '次级信息' },
      ],
      typography: ['标题：更大字号但更少层级', '正文：14/16，强调可读性', '标签：小字号大写/描边'],
      motifs: ['细线框', '圆角卡片', '少量图标'],
      texture: ['极轻颗粒', '柔和暗角'],
      composition: ['单一焦点居中或左对齐', '信息块之间用间距区分', '图片宁少勿多'],
      imageQueries: ['minimal poster design', 'typography poster black white', 'editorial minimal layout'],
    })
  } else if (isTech) {
    base.push({
      name: 'Neon Tech｜霓虹科技',
      tagline: '冷色高光与玻璃质感，强调速度与效率。',
      keywords: ['霓虹', '玻璃拟态', '流动光', '高对比', '结构线'],
      storytelling:
        '用“能量轨迹/流动光”做叙事主线，把关键信息嵌入结构线与模块；画面节奏更快，适合高频运营素材。',
      palette: [
        { name: 'Midnight', hex: '#0B0F19', usage: '底色' },
        { name: 'Indigo', hex: '#6366F1', usage: '主色' },
        { name: 'Cyan', hex: '#22D3EE', usage: '霓虹高光' },
        { name: 'Violet', hex: '#A78BFA', usage: '渐变补色' },
      ],
      typography: ['标题：更紧凑更锐利', '正文：更短句更强对比', '数字：等宽凸显理性'],
      motifs: ['网格线/路径线', '光点粒子', '箭头/进度条式符号'],
      texture: ['玻璃磨砂', '光晕', '微噪点'],
      composition: ['对角线或流线构图', '模块化分区', '主 CTA 用高光色'],
      imageQueries: ['futuristic poster design', 'neon gradient abstract', 'glassmorphism UI poster'],
    })
  } else if (isCommerce) {
    base.push({
      name: 'Commercial Impact｜电商冲击',
      tagline: '更强的对比与动线，抓住“卖点—利益—行动”。',
      keywords: ['强对比', '动线', '爆点标签', '主视觉放大', '色彩冲击'],
      storytelling:
        '把视觉焦点集中在 1 个“卖点符号”（价格/福利/限时/爆款），其余信息围绕动线排列；图片以“产品/场景”辅助，不做主角喧宾夺主。',
      palette: [
        { name: 'Night', hex: '#0B0F19', usage: '底色' },
        { name: 'Rose', hex: '#F43F5E', usage: '主强调' },
        { name: 'Amber', hex: '#F59E0B', usage: '次强调/标签' },
        { name: 'White', hex: '#F9FAFB', usage: '文字/反白块' },
      ],
      typography: ['标题：更粗更大', '信息层级更明确（价格/利益最大）', '标签：胶囊/爆炸贴形式'],
      motifs: ['价格贴/徽章', '箭头/引导符', '对比色块'],
      texture: ['轻颗粒或纸感', '局部高光'],
      composition: ['Z 型阅读动线', '主视觉占比更大', 'CTA 固定在同一位置'],
      imageQueries: ['sale poster design', 'ecommerce banner design', 'promotion typography poster'],
    })
  } else {
    base.push({
      name: 'Editorial Moodboard｜编辑式拼贴',
      tagline: '用拼贴与注释形成“可解释的灵感板”。',
      keywords: ['拼贴', '注释', '图文并置', '层级清晰', '质感'],
      storytelling:
        '把参考图变成可被复用的设计语言：每张图用 1 句解释它贡献的元素（色彩/材质/构图/符号），最终归纳成可执行的视觉规则。',
      palette: [
        { name: 'Charcoal', hex: '#111827', usage: '底色' },
        { name: 'Ink', hex: '#0B0F19', usage: '对比层' },
        { name: 'Indigo', hex: '#6366F1', usage: '强调' },
        { name: 'Emerald', hex: '#22C55E', usage: '点缀' },
      ],
      typography: ['标题：粗体无衬线', '正文：更像说明文档', '标签：小字号等宽'],
      motifs: ['注释线/编号', '小标签', '图片边框体系'],
      texture: ['纸张/胶片轻颗粒', '暗角'],
      composition: ['左右两栏：左叙事，右 moodboard', '卡片化模块', '每个方向 4–6 张图即可'],
      imageQueries: ['moodboard poster layout', 'editorial collage board', 'design direction moodboard'],
    })
  }

  return base.slice(0, 3)
}

function renderPalette(p: Direction['palette']): string {
  const rows = p
    .map((c) => `| ${c.name} | ${c.hex} | ${c.usage} |`)
    .join('\n')
  return ['| 色彩 | Hex | 用途 |', '|------|-----|------|', rows].join('\n')
}

function renderMoodboard(images: ReferenceImage[], max: number): string {
  const picks = images.slice(0, max)
  if (picks.length === 0) return '_（未找到参考图：建议用更具体的主题关键词，如“地点/文化对象/材质/色彩”）_'

  const lines = picks.map((img, idx) => {
    const title = (img.title ?? `参考图 ${idx + 1}`).replace(/\|/g, ' ')
    const thumb = img.thumbnailUrl ?? img.url
    const link = img.pageUrl ?? img.url
    return `- ![${title}](${thumb})\\\n  ${title}（${img.source ?? ''}）\\\n  ${link}`
  })
  return lines.join('\n')
}

function renderDirectionMoodboard(
  directionName: string,
  images: ReferenceImage[],
  byDirection?: Record<string, ReferenceImage[]>,
): string {
  const picks = byDirection?.[directionName]
  if (picks && picks.length > 0) return renderMoodboard(picks, picks.length)
  return renderMoodboard(images, Math.min(6, images.length))
}

export function generateDesignSpecMarkdown(
  input: CreateTaskInput,
  images: ReferenceImage[],
  byDirection?: Record<string, ReferenceImage[]>,
  externalImages?: ReferenceImage[],
): string {
  const requirement = clampText(input.requirementText, 800)
  const topic = extractTopic(input)

  const directions = buildVisualDirections(input)

  const imageNotes = [
    '先选 1 张作为“主风格锚点”（光感/材质/色彩），其余做补充',
    '每张图标注“贡献点”：色彩、构图、材质、符号、字体气质',
    '优先替换为可商用素材（本平台保留来源与外链便于追溯）',
  ]

  const imageTable = images
    .slice(0, 12)
    .map((img, idx) => {
      const title = img.title ? img.title.replace(/\|/g, ' ') : `参考图 ${idx + 1}`
      const src = img.source ?? ''
      const link = img.pageUrl ?? img.url
      return `| ${idx + 1} | ${title} | ${src} | ${link} |`
    })

  const table =
    imageTable.length > 0
      ? ['| # | 标题 | 来源 | 链接 |', '|---:|------|------|------|', ...imageTable].join('\n')
      : '_（未找到参考图时：请尝试更具体的关键词，如“行业 + 页面类型 + 风格”）_'

  return [
    '# 视觉设计方案（自动生成）',
    '',
    '## 需求摘要',
    requirement,
    '',
    '## 主题识别',
    topic,
    '',
    '## Atmosphere Direction（氛围方向）',
    toBulletList([
      '目标：更偏视觉与情绪统一（而非 UI 交互），输出可直接指导海报/主 KV/视觉延展的规则',
      '输出形式：关键词（Keywords）+ 叙事（Storytelling）+ 色彩/字体/纹理/构图 + Moodboard',
    ]),
    '',
    ...(externalImages && externalImages.length
      ? [
          '## 外部参考（用户提供）',
          '适用：Pinterest / Behance / 站内案例页链接。平台会尝试抓取页面的预览图（og:image）用于 Moodboard。',
          '',
          renderMoodboard(externalImages, Math.min(8, externalImages.length)),
          '',
        ]
      : []),
    ...directions.flatMap((d, i) => [
      `## Direction ${i + 1}：${d.name}`,
      '',
      `**一句话方向**：${d.tagline}`,
      '',
      '### Keywords',
      toBulletList(d.keywords),
      '',
      '### Storytelling',
      d.storytelling,
      '',
      '### Visual System',
      '#### 色彩（Palette）',
      renderPalette(d.palette),
      '',
      '#### 字体（Typography）',
      toBulletList(d.typography),
      '',
      '#### 符号与元素（Motifs）',
      toBulletList(d.motifs),
      '',
      '#### 材质与纹理（Texture）',
      toBulletList(d.texture),
      '',
      '#### 构图与版式（Composition）',
      toBulletList(d.composition),
      '',
      '### Moodboard',
      renderDirectionMoodboard(d.name, images, byDirection),
      '',
    ]),
    '## 参考图使用建议',
    toBulletList(imageNotes),
    '',
    '## 参考图清单',
    table,
    '',
    '## UI / 交互（后续补充）',
    '_本次方案优先覆盖视觉维度。若需要 UI 方案，可在需求中补充：信息架构、关键流程、组件清单、状态与边界情况。_',
    '',
  ].join('\n')
}

export function generateDesignSpecMarkdownFromDirections(input: CreateTaskInput, payload: {
  generationMode: 'template' | 'ai'
  generationNote?: string
  topic?: string
  directions: VisualDirection[]
  images: ReferenceImage[]
  byDirection?: Record<string, ReferenceImage[]>
  externalImages?: ReferenceImage[]
  kvByDirection?: Record<string, ReferenceImage[]>
}): string {
  const requirement = clampText(input.requirementText, 800)
  const topic = payload.topic ?? extractTopic(input)
  const directions = payload.directions

  const imageNotes = [
    '先选 1 张作为“主风格锚点”（光感/材质/色彩），其余做补充',
    '每张图标注“贡献点”：色彩、构图、材质、符号、字体气质',
    '优先替换为可商用素材（本平台保留来源与外链便于追溯）',
  ]

  const images = payload.images
  const byDirection = payload.byDirection
  const externalImages = payload.externalImages

  const imageTable = images
    .slice(0, 12)
    .map((img, idx) => {
      const title = img.title ? img.title.replace(/\|/g, ' ') : `参考图 ${idx + 1}`
      const src = img.source ?? ''
      const link = img.pageUrl ?? img.url
      return `| ${idx + 1} | ${title} | ${src} | ${link} |`
    })
    .join('\n')

  const table = [
    '| # | 标题 | 来源 | 链接 |',
    '|---:|------|------|------|',
    imageTable || '| - | - | - | - |',
  ].join('\n')

  return [
    '# 视觉设计方案（自动生成）',
    '',
    '## 需求摘要',
    requirement,
    '',
    '## 生成方式',
    payload.generationMode === 'ai' ? '大模型' : '模板',
    ...(payload.generationNote ? [payload.generationNote] : []),
    '',
    '## 主题识别',
    topic,
    '',
    '## Atmosphere Direction（氛围方向）',
    toBulletList([
      '目标：更偏视觉与情绪统一（而非 UI 交互），输出可直接指导海报/主 KV/视觉延展的规则',
      '输出形式：关键词（Keywords）+ 叙事（Storytelling）+ 色彩/字体/纹理/构图 + Moodboard',
    ]),
    '',
    ...(externalImages && externalImages.length
      ? [
          '## 外部参考（用户提供）',
          '适用：Pinterest / Behance / 站内案例页链接。平台会尝试抓取页面的预览图（og:image）用于 Moodboard。',
          '',
          renderMoodboard(externalImages, Math.min(8, externalImages.length)),
          '',
        ]
      : []),
    ...directions.flatMap((d, i) => [
      `## Direction ${i + 1}：${d.name}`,
      '',
      `**一句话方向**：${d.tagline}`,
      '',
      '### Keywords',
      toBulletList(d.keywords),
      '',
      '### Storytelling',
      d.storytelling,
      '',
      '### Visual System',
      '#### 色彩（Palette）',
      renderPalette(d.palette),
      '',
      '#### 字体（Typography）',
      toBulletList(d.typography),
      '',
      '#### 符号与元素（Motifs）',
      toBulletList(d.motifs),
      '',
      '#### 材质与纹理（Texture）',
      toBulletList(d.texture),
      '',
      '#### 构图与版式（Composition）',
      toBulletList(d.composition),
      '',
      '### KV 示意图（AI 生成）',
      payload.kvByDirection?.[d.name]?.length
        ? renderMoodboard(payload.kvByDirection[d.name], Math.min(2, payload.kvByDirection[d.name].length))
        : '_（未生成 KV：可检查 AI 配置或稍后重试）_',
      '',
      '### Moodboard',
      renderDirectionMoodboard(d.name, images, byDirection),
      '',
    ]),
    '## 参考图使用建议',
    toBulletList(imageNotes),
    '',
    '## 参考图清单',
    table,
    '',
    '## UI / 交互（后续补充）',
    '_本次方案优先覆盖视觉维度。若需要 UI 方案，可在需求中补充：信息架构、关键流程、组件清单、状态与边界情况。_',
    '',
  ].join('\n')
}
