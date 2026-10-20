/**
 * 渲染层的像素比换算。
 *
 * 画布的后备存储按设备像素分配，CSS 尺寸保持逻辑像素，
 * 这样在缩放比例不是百分之一百的屏幕上宠物不会被拉伸变糊。
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 把设备像素比规整成可用的正数；缺失、为零或非有限值时按一比一处理。 */
export function resolveScale(scale: number | undefined | null): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return scale;
}

/** 逻辑像素尺寸换算成后备存储尺寸，至少保留一个像素，避免画布退化为零尺寸。 */
export function backingStoreSize(logical: Size, scale: number): Size {
  const factor = resolveScale(scale);
  return {
    width: Math.max(1, Math.round(logical.width * factor)),
    height: Math.max(1, Math.round(logical.height * factor)),
  };
}

/** 物理像素坐标换算成逻辑像素坐标，用于把窗口坐标写回锚点。 */
export function physicalToLogical(point: Point, scale: number): Point {
  const factor = resolveScale(scale);
  return { x: point.x / factor, y: point.y / factor };
}
