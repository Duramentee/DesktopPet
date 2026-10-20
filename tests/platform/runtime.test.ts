import { describe, expect, it } from 'vitest';
import {
  degradedCapabilities,
  detectRuntime,
} from '../../src/platform/runtime';
import type { RuntimeInfo } from '../../src/platform/runtime';

function info(overrides: Partial<RuntimeInfo> = {}): RuntimeInfo {
  return { os: 'linux', wslDistro: null, hasWslgMount: false, ...overrides };
}

describe('运行环境识别', () => {
  it('Windows 环境识别为 windows', () => {
    expect(detectRuntime(info({ os: 'windows', wslDistro: null, hasWslgMount: false }))).toBe(
      'windows',
    );
  });

  it('macOS 环境识别为 macos', () => {
    expect(detectRuntime(info({ os: 'darwin', wslDistro: null, hasWslgMount: false }))).toBe(
      'macos',
    );
  });

  it('普通 Linux 环境识别为 linux', () => {
    expect(detectRuntime(info())).toBe('linux');
  });

  it('存在 WSLg 挂载点时识别为 WSL 中的 Linux 环境', () => {
    expect(detectRuntime(info({ hasWslgMount: true }))).toBe('linux-wsl');
  });

  it('只有 WSL 发行版名称而没有 WSLg 挂载点时同样识别为 WSL 中的 Linux 环境', () => {
    expect(detectRuntime(info({ wslDistro: 'Debian' }))).toBe('linux-wsl');
  });

  it('未知操作系统识别为 unknown', () => {
    expect(detectRuntime(info({ os: 'freebsd' }))).toBe('unknown');
  });

  it('WSL 环境下返回四条降级能力，并且每条都给出机制原因', () => {
    const warnings = degradedCapabilities('linux-wsl');
    expect(warnings.map((warning) => warning.capability)).toEqual([
      '窗口置顶',
      '鼠标穿透',
      '系统托盘',
      '透明背景',
    ]);
    for (const warning of warnings) {
      expect(warning.reason.length).toBeGreaterThan(0);
    }
  });

  it('非 WSL 环境没有降级能力', () => {
    expect(degradedCapabilities('windows')).toEqual([]);
    expect(degradedCapabilities('macos')).toEqual([]);
    expect(degradedCapabilities('linux')).toEqual([]);
    expect(degradedCapabilities('unknown')).toEqual([]);
  });
});
