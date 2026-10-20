/**
 * 坐标换算器。
 * 宠物以锚点表示自身位置，锚点是画布内的一个坐标，
 * 窗口左上角等于锚点位置减去锚点在画布内的坐标。
 */

import type { Point } from '../skin/types';

export function anchorToWindowTopLeft(anchorPosition: Point, anchor: Point): Point {
  return { x: anchorPosition.x - anchor.x, y: anchorPosition.y - anchor.y };
}

export function windowTopLeftToAnchor(topLeft: Point, anchor: Point): Point {
  return { x: topLeft.x + anchor.x, y: topLeft.y + anchor.y };
}
