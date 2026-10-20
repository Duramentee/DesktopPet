/**
 * 平台适配层：鼠标穿透。
 *
 * 宠物窗口是透明的矩形，但操作系统默认整块都拦截鼠标，宠物周围的透明角落
 * 会挡住桌面图标。Tauri 没有“按像素命中”的能力，因此这里定时读取全局光标位置，
 * 结合当前帧的透明度算出这块区域是否该拦截鼠标，只在状态变化时切换一次。
 *
 * 拖拽期间不做切换：系统拖拽循环依赖窗口持续接收鼠标，中途变成穿透会打断拖动。
 */

import type { Point } from '../core/skin/types';
import { physicalToLogical, resolveScale } from '../renderer/dpi';

export interface PointerRegionOptions {
  /** 读取光标的位置，单位为逻辑像素。 */
  cursor: () => Promise<Point>;
  /** 该屏幕坐标是否落在宠物不透明的像素上。 */
  isOnPet: (screen: Point) => boolean;
  /** 交互状态变化时回调：true 表示窗口应当接收鼠标。 */
  onChange: (interactive: boolean) => void | Promise<void>;
  /** 返回 true 时跳过本次判断，例如正在拖拽。 */
  isSuspended?: () => boolean;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * 开始监听光标与宠物的相对位置，返回停止函数。
 * 初始状态为可交互，只有光标落在透明区域时才会切换成穿透。
 */
export function watchPointerRegion(options: PointerRegionOptions): () => void {
  const intervalMs = options.intervalMs ?? 50;
  let interactive = true;
  let running = false;
  let stopped = false;

  const check = async (): Promise<void> => {
    if (stopped || running || options.isSuspended?.() === true) {
      return;
    }
    running = true;
    try {
      const point = await options.cursor();
      const next = options.isOnPet(point);
      if (next !== interactive) {
        interactive = next;
        await options.onChange(next);
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void check();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** 读取全局光标位置并换算成逻辑像素。只能在 Tauri 环境中调用。 */
export async function readCursorPosition(): Promise<Point> {
  const { cursorPosition } = await import('@tauri-apps/api/window');
  const physical = await cursorPosition();
  return physicalToLogical(physical, resolveScale(globalThis.devicePixelRatio));
}
