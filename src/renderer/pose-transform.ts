/**
 * 位姿换算。
 *
 * 渲染时先按画布坐标平移到底边中点，再按呼吸系数做纵向缩放；
 * 命中判定要把屏幕上的画布坐标反向换回帧图片的坐标，才查得到正确的像素。
 * 正变换在 CanvasRenderer.draw 里用画布变换实现，这里只放反向计算，
 * 两边必须保持同一套公式。
 */

import type { IdleMotionPose } from '../core/animation/idle-motion';
import type { Point } from '../core/skin/types';

/** 把画布坐标反向换算成帧图片的坐标。 */
export function canvasToFrame(
  point: Point,
  canvas: { width: number; height: number },
  motion: IdleMotionPose,
): Point {
  // 缩放系数异常时按 1 处理，避免除零把命中判定变成无穷大
  const scaleY = Number.isFinite(motion.scaleY) && motion.scaleY > 0 ? motion.scaleY : 1;
  return {
    x: point.x - motion.offsetX,
    y: canvas.height + (point.y - canvas.height - motion.offsetY) / scaleY,
  };
}
