import { describe, expect, it } from 'vitest';
import { backingStoreSize, physicalToLogical, resolveScale } from '../../src/renderer/dpi';

describe('设备像素比换算', () => {
  it('缺失、为零或非有限值的比例按一比一处理', () => {
    expect(resolveScale(undefined)).toBe(1);
    expect(resolveScale(null)).toBe(1);
    expect(resolveScale(0)).toBe(1);
    expect(resolveScale(-2)).toBe(1);
    expect(resolveScale(Number.NaN)).toBe(1);
    expect(resolveScale(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('合法的比例原样返回', () => {
    expect(resolveScale(1)).toBe(1);
    expect(resolveScale(1.25)).toBe(1.25);
    expect(resolveScale(2)).toBe(2);
  });

  it('后备存储按比例放大并四舍五入到整数像素', () => {
    expect(backingStoreSize({ width: 64, height: 64 }, 1)).toEqual({ width: 64, height: 64 });
    expect(backingStoreSize({ width: 64, height: 64 }, 1.5)).toEqual({ width: 96, height: 96 });
    expect(backingStoreSize({ width: 64, height: 64 }, 2)).toEqual({ width: 128, height: 128 });
    expect(backingStoreSize({ width: 37, height: 11 }, 1.25)).toEqual({ width: 46, height: 14 });
  });

  it('后备存储尺寸至少一个像素，避免画布退化为零尺寸', () => {
    expect(backingStoreSize({ width: 0, height: 0 }, 2)).toEqual({ width: 1, height: 1 });
  });

  it('物理坐标按比例换算成逻辑坐标', () => {
    expect(physicalToLogical({ x: 936, y: 1072 }, 2)).toEqual({ x: 468, y: 536 });
    expect(physicalToLogical({ x: 100, y: 200 }, 0)).toEqual({ x: 100, y: 200 });
  });
});
