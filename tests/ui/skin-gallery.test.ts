import { describe, expect, it } from 'vitest';
import { buildGalleryCards } from '../../src/ui/skin-gallery';
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
});
