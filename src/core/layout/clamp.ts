/**
 * 位置约束器。
 * 把候选坐标夹紧到某一块显示器的工作区内，
 * 保证宠物不会被拖到屏幕可视范围之外而无法再次找回。
 */

import type { Point, Rect } from '../skin/types';

export function clampToWorkArea(candidate: Point, workAreas: Rect[]): Point {
  if (workAreas.length === 0) {
    return { x: candidate.x, y: candidate.y };
  }
  const containing = workAreas.find((area) => contains(area, candidate));
  const target = containing ?? nearest(candidate, workAreas);
  return {
    x: clamp(candidate.x, target.x, target.x + target.width),
    y: clamp(candidate.y, target.y, target.y + target.height),
  };
}

function contains(area: Rect, point: Point): boolean {
  return (
    point.x >= area.x &&
    point.x <= area.x + area.width &&
    point.y >= area.y &&
    point.y <= area.y + area.height
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function nearest(point: Point, areas: Rect[]): Rect {
  let best = areas[0];
  if (best === undefined) {
    throw new Error('工作区列表为空，调用方应当先做空列表判断');
  }
  let bestDistance = squaredDistanceToArea(point, best);
  for (const area of areas) {
    const distance = squaredDistanceToArea(point, area);
    if (distance < bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

function squaredDistanceToArea(point: Point, area: Rect): number {
  const nearestX = clamp(point.x, area.x, area.x + area.width);
  const nearestY = clamp(point.y, area.y, area.y + area.height);
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return dx * dx + dy * dy;
}
