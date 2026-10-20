import { describe, expect, it } from 'vitest';
import { FpsMeter } from '../../src/renderer/fps';

describe('帧率统计', () => {
  it('窗口没攒满时不产生报告', () => {
    const meter = new FpsMeter(1000);
    expect(meter.sample(16)).toBeNull();
    expect(meter.sample(16)).toBeNull();
  });

  it('窗口攒满后给出平均帧率与最长帧耗时', () => {
    const meter = new FpsMeter(100);
    meter.sample(10);
    meter.sample(60);
    const report = meter.sample(30);
    expect(report).not.toBeNull();
    expect(report?.frames).toBe(3);
    expect(report?.fps).toBe(30);
    expect(report?.longestFrameMs).toBe(60);
  });

  it('非有限值与非正数的间隔被忽略', () => {
    const meter = new FpsMeter(100);
    expect(meter.sample(0)).toBeNull();
    expect(meter.sample(-5)).toBeNull();
    expect(meter.sample(Number.NaN)).toBeNull();
    expect(meter.sample(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('每次报告之后重新累计，不把上一窗口的数据算进来', () => {
    const meter = new FpsMeter(100);
    meter.sample(50);
    expect(meter.sample(50)?.frames).toBe(2);

    const next = meter.sample(100);
    expect(next?.frames).toBe(1);
    expect(next?.fps).toBe(10);
  });
});
