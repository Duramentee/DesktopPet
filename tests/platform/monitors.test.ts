import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchWorkAreas, workAreaSignature } from '../../src/platform/monitors';
import type { Rect } from '../../src/core/skin/types';

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const SECONDARY: Rect = { x: 1920, y: 0, width: 1280, height: 1024 };

describe('显示器布局监听', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('布局指纹对顺序不敏感，对尺寸变化敏感', () => {
    expect(workAreaSignature([PRIMARY, SECONDARY])).toBe(
      workAreaSignature([SECONDARY, PRIMARY]),
    );
    expect(workAreaSignature([PRIMARY])).not.toBe(workAreaSignature([PRIMARY, SECONDARY]));
  });

  it('首次读取只建立基准，不触发回调', async () => {
    const onChange = vi.fn();
    const stop = watchWorkAreas(onChange, { list: async () => [PRIMARY], intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('布局变化时把新的工作区上报一次，重复的布局不再上报', async () => {
    let areas: Rect[] = [PRIMARY];
    const onChange = vi.fn();
    const stop = watchWorkAreas(onChange, { list: async () => areas, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).not.toHaveBeenCalled();

    areas = [PRIMARY, SECONDARY];
    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([PRIMARY, SECONDARY]);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);

    areas = [PRIMARY];
    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('读取失败时保持上一次的布局，不中断后续轮询', async () => {
    let fail = true;
    const errors: unknown[] = [];
    const onChange = vi.fn();
    const stop = watchWorkAreas(onChange, {
      list: async () => {
        if (fail) {
          throw new Error('读取显示器失败');
        }
        return [PRIMARY, SECONDARY];
      },
      intervalMs: 100,
      onError: (error) => errors.push(error),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);

    fail = false;
    await vi.advanceTimersByTimeAsync(100);
    // 首次成功读取只建立基准
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('停止监听后不再轮询', async () => {
    const list = vi.fn(async () => [PRIMARY]);
    const stop = watchWorkAreas(() => {}, { list, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterBaseline = list.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(list.mock.calls.length).toBe(callsAfterBaseline);
  });
});
