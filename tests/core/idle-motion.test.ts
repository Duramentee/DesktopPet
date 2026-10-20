import { describe, expect, it } from 'vitest';
import { IdleMotion, NEUTRAL_POSE } from '../../src/core/animation/idle-motion';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0.5;
    index += 1;
    return value;
  };
}

describe('待机小动作', () => {
  it('初始位姿为中立', () => {
    const motion = new IdleMotion();
    expect(motion.current).toEqual(NEUTRAL_POSE);
  });

  it('呼吸在 1 与 1 减振幅之间起伏，起点为 1', () => {
    const motion = new IdleMotion({ breathPeriodMs: 1000, breathAmplitude: 0.04 });
    expect(motion.advance(0).scaleY).toBe(1);
    expect(motion.advance(500).scaleY).toBeCloseTo(0.96, 3);
    expect(motion.advance(500).scaleY).toBeCloseTo(1, 3);
  });

  it('第一次张望之前不产生水平偏移', () => {
    const motion = new IdleMotion({
      glanceIntervalMs: [1000, 1000],
      random: () => 0,
    });
    expect(motion.advance(900).offsetX).toBe(0);
  });

  it('张望时移动到侧向、停留，再回到原位', () => {
    const motion = new IdleMotion({
      glanceIntervalMs: [100, 100],
      glanceRampMs: 50,
      glanceHoldMs: 100,
      glanceOffset: 2,
      random: () => 0,
    });
    // 第 100 毫秒进入张望，方向由随机源决定为负向
    expect(motion.advance(100).offsetX).toBe(0);
    expect(motion.advance(25).offsetX).toBe(-1);
    expect(motion.advance(25).offsetX).toBe(-2);
    expect(motion.advance(100).offsetX).toBe(-2);
    expect(motion.advance(50).offsetX).toBe(0);
  });

  it('重置后回到中立位姿并重新计时', () => {
    const motion = new IdleMotion({ breathPeriodMs: 1000, breathAmplitude: 0.04 });
    motion.advance(500);
    motion.reset();
    expect(motion.current).toEqual(NEUTRAL_POSE);
    expect(motion.advance(500).scaleY).toBeCloseTo(0.96, 3);
  });

  it('非有限值与非正数的时间间隔被忽略', () => {
    const motion = new IdleMotion({ breathPeriodMs: 1000, breathAmplitude: 0.04 });
    expect(motion.advance(Number.NaN)).toEqual(NEUTRAL_POSE);
    expect(motion.advance(0)).toEqual(NEUTRAL_POSE);
    expect(motion.advance(-10)).toEqual(NEUTRAL_POSE);
  });

  it('张望方向随随机源改变', () => {
    const motion = new IdleMotion({
      glanceIntervalMs: [100, 100],
      glanceRampMs: 50,
      glanceHoldMs: 100,
      glanceOffset: 3,
      random: sequence([0.9]),
    });
    motion.advance(100);
    expect(motion.advance(50).offsetX).toBe(3);
  });
});
