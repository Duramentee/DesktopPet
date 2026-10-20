import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPointerRegion } from '../../src/platform/pointer-region';
import type { Point } from '../../src/core/skin/types';

describe('鼠标穿透判断', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始按可交互处理，光标落在透明区域时才切换成穿透', async () => {
    let point: Point = { x: 10, y: 10 };
    const changes: boolean[] = [];
    const stop = watchPointerRegion({
      cursor: async () => point,
      isOnPet: (screen) => screen.x >= 100,
      onChange: (interactive) => { changes.push(interactive); },
      intervalMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(changes).toEqual([false]);

    point = { x: 120, y: 120 };
    await vi.advanceTimersByTimeAsync(50);
    expect(changes).toEqual([false, true]);

    await vi.advanceTimersByTimeAsync(200);
    expect(changes).toEqual([false, true]);
    stop();
  });

  it('拖拽期间跳过判断，避免打断系统拖拽循环', async () => {
    const changes: boolean[] = [];
    const stop = watchPointerRegion({
      cursor: async () => ({ x: 0, y: 0 }),
      isOnPet: () => false,
      isSuspended: () => true,
      onChange: (interactive) => { changes.push(interactive); },
      intervalMs: 50,
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(changes).toEqual([]);
    stop();
  });

  it('读取光标失败时只记录错误，不切换状态', async () => {
    const changes: boolean[] = [];
    const errors: unknown[] = [];
    const stop = watchPointerRegion({
      cursor: async () => {
        throw new Error('无法读取光标');
      },
      isOnPet: () => false,
      onChange: (interactive) => { changes.push(interactive); },
      intervalMs: 50,
      onError: (error) => errors.push(error),
    });

    await vi.advanceTimersByTimeAsync(150);
    expect(errors.length).toBeGreaterThan(0);
    expect(changes).toEqual([]);
    stop();
  });

  it('停止后不再轮询', async () => {
    const cursor = vi.fn(async () => ({ x: 0, y: 0 }));
    const stop = watchPointerRegion({
      cursor,
      isOnPet: () => true,
      onChange: () => {},
      intervalMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    const calls = cursor.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(cursor.mock.calls.length).toBe(calls);
  });
});

