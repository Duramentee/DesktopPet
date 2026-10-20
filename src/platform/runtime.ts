/**
 * 平台适配层：运行环境识别。
 *
 * WSL 内部的 Linux 图形会话由 WSLg 提供，它是一个把 Linux 窗口经远程桌面协议
 * 转发到 Windows 的合成器，因此不具备原生的窗口层级控制与托盘协议转发能力。
 * 本文件把运行环境识别为具体的类别，并给出该类别下已知会失效的能力清单，
 * 使程序在降级运行时能够明确告知使用者，而不是表现为无原因的异常。
 */

export type RuntimeKind = 'windows' | 'macos' | 'linux' | 'linux-wsl' | 'unknown';

/** Rust 侧 runtime_info 命令返回的原始事实。 */
export interface RuntimeInfo {
  /** 操作系统类别，取值为 Node 与 Rust 通用的 win32、darwin、linux 等字符串。 */
  os: string;
  /** WSL 发行版名称，非 WSL 环境下为 null。 */
  wslDistro: string | null;
  /** 是否存在 WSLg 的挂载点。 */
  hasWslgMount: boolean;
}

export interface CapabilityWarning {
  capability: string;
  reason: string;
}

/** 根据原始事实判断运行环境类别。 */
export function detectRuntime(info: RuntimeInfo): RuntimeKind {
  if (info.os === 'windows' || info.os === 'win32') {
    return 'windows';
  }
  if (info.os === 'macos' || info.os === 'darwin') {
    return 'macos';
  }
  if (info.os === 'linux') {
    if (info.hasWslgMount || (info.wslDistro !== null && info.wslDistro.length > 0)) {
      return 'linux-wsl';
    }
    return 'linux';
  }
  return 'unknown';
}

/**
 * 返回当前运行环境下已知会失效的能力清单。
 * 只有 WSL 中的 Linux 图形会话存在这类限制，其余环境返回空数组。
 */
export function degradedCapabilities(kind: RuntimeKind): CapabilityWarning[] {
  if (kind !== 'linux-wsl') {
    return [];
  }
  return [
    {
      capability: '窗口置顶',
      reason: 'WSLg 的合成器不采纳窗口层级请求，宠物无法保持在其他窗口之上',
    },
    {
      capability: '鼠标穿透',
      reason: 'WSLg 不采纳输入区域请求，宠物画布之外的范围仍然会拦截鼠标事件',
    },
    {
      capability: '系统托盘',
      reason: 'WSLg 不把 Linux 托盘的 StatusNotifier 协议转发到 Windows 的通知区域，托盘图标不会出现',
    },
    {
      capability: '透明背景',
      reason: 'WSLg 经远程桌面协议合成窗口，透明区域可能被渲染成不透明底色',
    },
  ];
}

/** 读取运行环境原始事实。命令调用失败时返回 unknown，使程序继续启动。 */
export async function readRuntimeInfo(): Promise<RuntimeInfo> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<RuntimeInfo>('runtime_info')) ?? unknownRuntime();
  } catch (error) {
    console.warn('[runtime] 读取运行环境失败，按未知环境处理', error);
    return unknownRuntime();
  }
}

function unknownRuntime(): RuntimeInfo {
  return { os: 'unknown', wslDistro: null, hasWslgMount: false };
}
