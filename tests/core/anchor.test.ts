import { describe, expect, it } from 'vitest';
import {
  anchorToWindowTopLeft,
  windowTopLeftToAnchor,
} from '../../src/core/layout/anchor';

describe('坐标换算器', () => {
  // T18
  it('已知锚点坐标与宠物锚点位置时，窗口左上角坐标等于两者之差', () => {
    expect(anchorToWindowTopLeft({ x: 100, y: 200 }, { x: 32, y: 64 })).toEqual({
      x: 68,
      y: 136,
    });
  });

  it('由窗口左上角坐标反算锚点位置，结果与正向换算互逆', () => {
    const anchor = { x: 5, y: 60 };
    const anchorPosition = { x: 320, y: 480 };
    const topLeft = anchorToWindowTopLeft(anchorPosition, anchor);
    expect(windowTopLeftToAnchor(topLeft, anchor)).toEqual(anchorPosition);
  });

  it('锚点取左上角时，窗口左上角坐标等于锚点位置', () => {
    expect(anchorToWindowTopLeft({ x: 7, y: 9 }, { x: 0, y: 0 })).toEqual({ x: 7, y: 9 });
  });
});
