/**
 * 平台适配层：显示器工作区。
 *
 * Tauri 的显示器信息以物理像素给出，而领域层使用逻辑像素，
 * 因此本文件按每个显示器的缩放比例除算，把物理像素换算成逻辑像素。
 */

import type { Rect } from '../core/skin/types';

interface PhysicalPoint {
  x: number;
  y: number;
}

interface PhysicalSize {
  width: number;
  height: number;
}

interface TauriMonitorLike {
  position: PhysicalPoint;
  size: PhysicalSize;
  scaleFactor: number;
  workArea?: {
    position: PhysicalPoint;
    size: PhysicalSize;
  };
}

/** 把单个显示器信息换算成逻辑像素下的工作区矩形。 */
export function monitorToWorkArea(monitor: TauriMonitorLike): Rect {
  const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1;
  const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  return {
    x: area.position.x / scale,
    y: area.position.y / scale,
    width: area.size.width / scale,
    height: area.size.height / scale,
  };
}

/** 读取全部显示器的工作区。读取失败时退化为单个保守工作区。 */
export async function listWorkAreas(): Promise<Rect[]> {
  try {
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const monitors = (await availableMonitors()) as TauriMonitorLike[];
    if (monitors.length === 0) {
      return [fallbackWorkArea()];
    }
    return monitors.map((monitor) => monitorToWorkArea(monitor));
  } catch (error) {
    console.warn('[screen] 读取显示器信息失败，改用单个保守工作区', error);
    return [fallbackWorkArea()];
  }
}

function fallbackWorkArea(): Rect {
  return { x: 0, y: 0, width: 1920, height: 1080 };
}
