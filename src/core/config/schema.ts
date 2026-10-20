/**
 * 配置文件的结构定义、解析与读写。
 * 解析过程必须对损坏的输入保持容错：任何字段缺失或者类型错误都回退到缺省值，
 * 不允许因为配置文件损坏而让程序无法启动。
 */

import type { Point } from '../skin/types';

export interface AppConfig {
  activeSkinId: string;
  alwaysOnTop: boolean;
  anchorPosition: Point;
}

export interface ConfigStore {
  read(): string | null;
  write(text: string): void;
}

/** 缺省配置。当主显示器尺寸未知时，锚点位置取一个保守值。 */
export const DEFAULT_CONFIG: AppConfig = Object.freeze({
  activeSkinId: 'default',
  alwaysOnTop: true,
  anchorPosition: Object.freeze({ x: 960, y: 1040 }) as Point,
}) as AppConfig;

/** 用缺省值构造一份可修改的配置副本。 */
export function createDefaultConfig(): AppConfig {
  return {
    activeSkinId: DEFAULT_CONFIG.activeSkinId,
    alwaysOnTop: DEFAULT_CONFIG.alwaysOnTop,
    anchorPosition: { ...DEFAULT_CONFIG.anchorPosition },
  };
}

/** 解析配置文本。传入 null 或者非法文本时返回缺省值的副本。 */
export function parseConfig(text: string | null): AppConfig {
  const config = createDefaultConfig();
  if (text === null) {
    return config;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return config;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return config;
  }
  const record = parsed as Record<string, unknown>;

  const activeSkinId = record['activeSkinId'];
  if (typeof activeSkinId === 'string' && activeSkinId.length > 0) {
    config.activeSkinId = activeSkinId;
  }

  const alwaysOnTop = record['alwaysOnTop'];
  if (typeof alwaysOnTop === 'boolean') {
    config.alwaysOnTop = alwaysOnTop;
  }

  const anchorPosition = record['anchorPosition'];
  if (typeof anchorPosition === 'object' && anchorPosition !== null) {
    const point = anchorPosition as Record<string, unknown>;
    const x = point['x'];
    const y = point['y'];
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      config.anchorPosition = { x, y };
    }
  }

  return config;
}

/** 序列化配置。使用两个空格缩进，便于用户直接编辑配置文件。 */
export function serializeConfig(config: AppConfig): string {
  return JSON.stringify(
    {
      activeSkinId: config.activeSkinId,
      alwaysOnTop: config.alwaysOnTop,
      anchorPosition: { x: config.anchorPosition.x, y: config.anchorPosition.y },
    },
    null,
    2,
  );
}

export function saveConfig(store: ConfigStore, config: AppConfig): void {
  store.write(serializeConfig(config));
}

export function loadConfig(store: ConfigStore): AppConfig {
  return parseConfig(store.read());
}
