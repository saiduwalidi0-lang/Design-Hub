/** HTTP 不可达时的回退；与 `banner-expand-tool/public/avatar-frame-defaults/defaults.json` 保持同步 */
export type AvatarFrameDefaultsGroup = {
  id: string
  name: string
  /** 与网页一致：相对 `avatar-frame-defaults/` 的缩略图路径 */
  thumbnail?: string
  order: string[]
  elements: Partial<Record<'element1' | 'element2' | 'element3', { src: string }>>
}

export type AvatarFrameDefaultsFile = {
  defaultGroupId: string
  groups: AvatarFrameDefaultsGroup[]
}

export const EMBEDDED_AVATAR_FRAME_DEFAULTS: AvatarFrameDefaultsFile = {
  defaultGroupId: 'group-1',
  groups: [
    {
      id: 'group-1',
      name: '默认组（奖杯）',
      thumbnail: 'thumbs/group-1.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'surround.png' },
        element3: { src: 'top.png' },
      },
    },
    {
      id: 'group-2',
      name: '第二组',
      thumbnail: 'thumbs/group-2.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-2/surround.png' },
        element3: { src: 'sets/group-2/top.png' },
      },
    },
    {
      id: 'group-3',
      name: '第三组',
      thumbnail: 'thumbs/group-3.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-3/surround.png' },
        element3: { src: 'sets/group-3/top.png' },
      },
    },
    {
      id: 'group-4',
      name: '第四组',
      thumbnail: 'thumbs/group-4.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-4/surround.png' },
        element3: { src: 'sets/group-4/top.png' },
      },
    },
    {
      id: 'group-5',
      name: '第五组',
      thumbnail: 'thumbs/group-5.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-5/surround.png' },
        element3: { src: 'sets/group-5/top.png' },
      },
    },
  ],
}
