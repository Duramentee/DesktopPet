/**
 * 平台适配层：显示器布局监听。
 *
 * Tauri 没有提供显示器热插拔事件，因此这里按固定间隔重新读取工作区，
 * 用布局指纹判断是否发生了变化，只在变化时通知上层。
 * 显示器信息读取失败时沿用上一次的布局，不打断宠物的正常运行。
 */

import type { Rect } from '../core/skin/types';
import { listWorkAreas } from './screen';

export interface WorkAreaWatcherDeps {
  /** 读取当前全部显示器的工作区，默认使用平台层的实现。 */
  list?: () => Promise<Rect[]>;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/** 把一组工作区折叠成可比较的指纹。 */
export function workAreaSignature(areas: Rect[]): string {
  return areas
    .map((area) => `${area.x},${area.y},${area.width},${area.height}`)
    .sort()
    .join('|');
}

/**
 * 开始监听显示器布局变化，返回停止监听的函数。
 * 变化只在指纹不同的时候上报一次，避免每轮轮询都触发位置修正。
 */
export function watchWorkAreas(
  onChange: (areas: Rect[]) => Promise<void> | void,
  deps: WorkAreaWatcherDeps = {},
): () => void {
  const list = deps.list ?? listWorkAreas;
  const intervalMs = deps.intervalMs ?? 2000;
  const onError = deps.onError ?? ((error: unknown) => console.warn('[monitors] 轮询显示器布局失败', error));

  let signature: string | null = null;
  let running = false;
  let stopped = false;

  const check = async (): Promise<void> => {
    if (running || stopped) {
      return;
    }
    running = true;
    try {
      const areas = await list();
      const next = workAreaSignature(areas);
      if (signature === null) {
        signature = next;
        return;
      }
      if (next !== signature) {
        signature = next;
        await onChange(areas);
      }
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  void check();
  const timer = setInterval(() => {
    void check();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
