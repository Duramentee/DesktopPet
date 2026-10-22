/**
 * 坐标换算器。
 * 宠物以锚点表示自身位置，锚点是画布内的一个坐标，
 * 窗口左上角等于锚点位置减去锚点在画布内的坐标。
 *
 * 第三方参数是宠物的显示倍率：窗口尺寸等于画布乘以倍率，
 * 因此锚点在窗口里的偏移也要跟着缩放。
 */

import type { Point } from '../skin/types';

export function anchorToWindowTopLeft(anchorPosition: Point, anchor: Point, scale = 1): Point {
  return { x: anchorPosition.x - anchor.x * scale, y: anchorPosition.y - anchor.y * scale };
}

export function windowTopLeftToAnchor(topLeft: Point, anchor: Point, scale = 1): Point {
  return { x: topLeft.x + anchor.x * scale, y: topLeft.y + anchor.y * scale };
}
