/**
 * 皮肤管理窗口的卡片构造。
 *
 * 只做数据整形，不接触 DOM，因此可以在单元测试里验证激活态与顺序。
 */

import type { SkinSummary } from '../app/controller';

export interface GalleryCard {
  id: string;
  name: string;
  /** 预览图地址，读取失败时为 null，界面显示占位块。 */
  previewUrl: string | null;
  /** 是否是当前正在使用的皮肤。 */
  active: boolean;
}

export function buildGalleryCards(
  skins: SkinSummary[],
  activeId: string,
  previews: ReadonlyMap<string, string | null>,
): GalleryCard[] {
  return skins.map((skin) => ({
    id: skin.id,
    name: skin.displayName,
    previewUrl: previews.get(skin.id) ?? null,
    active: skin.id === activeId,
  }));
}
