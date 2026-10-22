/**
 * 皮肤管理窗口的卡片构造。
 *
 * 只做数据整形，不接触 DOM，因此可以在单元测试里验证激活态与顺序。
 */

import type { SkinDetails, SkinSummary } from '../app/controller';

export interface GalleryCard {
  id: string;
  name: string;
  /** 预览图地址，读取失败时为 null，界面显示占位块。 */
  previewUrl: string | null;
  /** 尺寸与帧数的简要说明，读取不到清单时为空串。 */
  meta: string;
  /** 是否是当前正在使用的皮肤。 */
  active: boolean;
}

/** 把皮肤概况折成一行说明，例如「96×96 · 待机 61 帧 · 拖拽 8 帧」。 */
export function formatSkinMeta(details: SkinDetails | null | undefined): string {
  if (details === null || details === undefined) {
    return '';
  }
  const size = `${details.canvas.width}×${details.canvas.height}`;
  const idle = details.idleFrames > 0 ? `待机 ${details.idleFrames} 帧` : '待机帧缺失';
  const drag = details.dragFrames > 0 ? `拖拽 ${details.dragFrames} 帧` : '拖拽帧缺失';
  return `${size} · ${idle} · ${drag}`;
}

export function buildGalleryCards(
  skins: SkinSummary[],
  activeId: string,
  previews: ReadonlyMap<string, string | null>,
  details: ReadonlyMap<string, SkinDetails | null> = new Map(),
): GalleryCard[] {
  return skins.map((skin) => ({
    id: skin.id,
    name: skin.displayName,
    previewUrl: previews.get(skin.id) ?? null,
    meta: formatSkinMeta(details.get(skin.id)),
    active: skin.id === activeId,
  }));
}
