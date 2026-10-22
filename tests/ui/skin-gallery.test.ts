import { describe, expect, it } from 'vitest';
import { buildGalleryCards, formatSkinMeta } from '../../src/ui/skin-gallery';
import type { SkinSummary } from '../../src/app/controller';

const SKINS: SkinSummary[] = [
  { id: 'default', displayName: '占位皮肤' },
  { id: 'midnight', displayName: '午夜皮肤' },
];

describe('皮肤管理卡片', () => {
  it('保持索引顺序，并把当前皮肤标记为激活', () => {
    const previews = new Map<string, string | null>([
      ['default', 'skins/default/images/idle_0.png'],
      ['midnight', 'skins/midnight/images/idle_0.png'],
    ]);
    const cards = buildGalleryCards(SKINS, 'midnight', previews);
    expect(cards.map((card) => card.id)).toEqual(['default', 'midnight']);
    expect(cards.map((card) => card.active)).toEqual([false, true]);
    expect(cards[0]?.previewUrl).toBe('skins/default/images/idle_0.png');
  });

  it('预览读取失败时保留卡片，地址为空', () => {
    const cards = buildGalleryCards(SKINS, 'default', new Map());
    expect(cards).toHaveLength(2);
    expect(cards[0]?.previewUrl).toBeNull();
    expect(cards[0]?.active).toBe(true);
  });

  it('激活标识不存在时所有卡片都不是激活态', () => {
    const cards = buildGalleryCards(SKINS, 'missing', new Map());
    expect(cards.every((card) => !card.active)).toBe(true);
  });

  it('带概况时把尺寸与帧数写进说明', () => {
    const details = new Map([
      ['default', { canvas: { width: 64, height: 64 }, idleFrames: 4, dragFrames: 2 }],
      ['midnight', { canvas: { width: 96, height: 96 }, idleFrames: 61, dragFrames: 8 }],
    ]);
    const cards = buildGalleryCards(SKINS, 'default', new Map(), details);
    expect(cards[0]?.meta).toBe('64×64 · 待机 4 帧 · 拖拽 2 帧');
    expect(cards[1]?.meta).toBe('96×96 · 待机 61 帧 · 拖拽 8 帧');
  });

  it('概况缺失或帧数为零时给出可读的说明', () => {
    const cards = buildGalleryCards(SKINS, 'default', new Map());
    expect(cards[0]?.meta).toBe('');
    expect(
      formatSkinMeta({ canvas: { width: 64, height: 64 }, idleFrames: 0, dragFrames: 0 }),
    ).toBe('64×64 · 待机帧缺失 · 拖拽帧缺失');
  });
});
