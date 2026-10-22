import { describe, expect, it } from 'vitest';
import { canvasToFrame } from '../../src/renderer/pose-transform';
import { NEUTRAL_POSE } from '../../src/core/animation/idle-motion';

const CANVAS = { width: 96, height: 96 };

describe('位姿反变换', () => {
  it('中立位姿下坐标原样返回', () => {
    expect(canvasToFrame({ x: 40, y: 50 }, CANVAS, NEUTRAL_POSE)).toEqual({ x: 40, y: 50 });
  });

  it('张望产生的水平偏移被减掉', () => {
    expect(canvasToFrame({ x: 40, y: 50 }, CANVAS, { offsetX: 2, offsetY: 0, scaleY: 1 })).toEqual({
      x: 38,
      y: 50,
    });
  });

  it('呼吸的纵向缩放以底边为基准反算', () => {
    // 底边不动，越靠上偏移越大：画布 y=0 处的帧坐标是 96 + (0 - 96) / 0.5 = -96
    const pose = { offsetX: 0, offsetY: 0, scaleY: 0.5 };
    expect(canvasToFrame({ x: 48, y: 96 }, CANVAS, pose)).toEqual({ x: 48, y: 96 });
    expect(canvasToFrame({ x: 48, y: 48 }, CANVAS, pose)).toEqual({ x: 48, y: 0 });
  });

  it('缩放系数非法时按一比一处理，不产生无穷大', () => {
    const pose = { offsetX: 0, offsetY: 0, scaleY: 0 };
    const point = canvasToFrame({ x: 10, y: 20 }, CANVAS, pose);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(point).toEqual({ x: 10, y: 20 });
  });

  it('纵向平移与缩放同时生效时先减平移再反缩放', () => {
    const pose = { offsetX: -3, offsetY: 1, scaleY: 0.5 };
    // x: 50 - (-3) = 53；y: 96 + (90 - 96 - 1) / 0.5 = 96 - 14 = 82
    expect(canvasToFrame({ x: 50, y: 90 }, CANVAS, pose)).toEqual({ x: 53, y: 82 });
  });
});
