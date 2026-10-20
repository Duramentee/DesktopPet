import { describe, expect, it } from 'vitest';
import { FramePacer } from '../../src/renderer/loop';

describe('FramePacer', () => {
  it('默认把绘制频率限制在每秒三十次', () => {
    const pacer = new FramePacer();
    expect(pacer.targetFps).toBe(30);
    expect(pacer.intervalMs).toBeCloseTo(1000 / 30, 6);
  });

  it('未到间隔时跳过这一帧', () => {
    const pacer = new FramePacer(30);
    expect(pacer.due(5)).toBeNull();
    expect(pacer.due(5)).toBeNull();
    expect(pacer.due(5)).toBeNull();
  });

  it('到点后返回自上次绘制以来累积的全部时间', () => {
    const pacer = new FramePacer(30);
    for (let index = 0; index < 6; index += 1) {
      expect(pacer.due(5)).toBeNull();
    }
    // 六次五毫秒共三十毫秒，仍未到三十三点三毫秒
    expect(pacer.due(5)).toBeCloseTo(35, 6);
  });

  it('触发后重新计时，长间隔只触发一次', () => {
    const pacer = new FramePacer(30);
    expect(pacer.due(1000)).toBeCloseTo(1000, 6);
    expect(pacer.due(1)).toBeNull();
    expect(pacer.due(40)).toBeCloseTo(41, 6);
  });

  it('两百次每秒的回调被压到三十次每秒', () => {
    const pacer = new FramePacer(30);
    let draws = 0;
    let advanced = 0;
    for (let index = 0; index < 200; index += 1) {
      const step = pacer.due(5);
      if (step !== null) {
        draws += 1;
        advanced += step;
      }
    }
    expect(draws).toBeGreaterThanOrEqual(28);
    expect(draws).toBeLessThanOrEqual(30);
    // 被跳过的时间没有丢失，一秒内推进的时间几乎等于一秒
    expect(advanced).toBeGreaterThanOrEqual(950);
    expect(advanced).toBeLessThanOrEqual(1000);
  });

  it('忽略非正数与非有限的时间间隔', () => {
    const pacer = new FramePacer(30);
    expect(pacer.due(0)).toBeNull();
    expect(pacer.due(-20)).toBeNull();
    expect(pacer.due(Number.NaN)).toBeNull();
    expect(pacer.due(Number.POSITIVE_INFINITY)).toBeNull();
    expect(pacer.due(40)).toBeCloseTo(40, 6);
  });

  it('拒绝非法目标帧率', () => {
    expect(() => new FramePacer(0)).toThrow();
    expect(() => new FramePacer(-1)).toThrow();
    expect(() => new FramePacer(Number.NaN)).toThrow();
    expect(() => new FramePacer(500)).toThrow();
  });
});
