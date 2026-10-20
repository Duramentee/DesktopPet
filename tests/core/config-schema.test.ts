import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
} from '../../src/core/config/schema';
import type { AppConfig, ConfigStore } from '../../src/core/config/schema';

class MemoryStore implements ConfigStore {
  private text: string | null = null;

  read(): string | null {
    return this.text;
  }

  write(text: string): void {
    this.text = text;
  }

  seed(text: string): void {
    this.text = text;
  }
}

describe('配置存储', () => {
  // T15
  it('保存位置与置顶状态后重新加载，逐字段与保存内容一致', () => {
    const store = new MemoryStore();
    const config: AppConfig = {
      activeSkinId: 'placeholder',
      alwaysOnTop: false,
      autoStart: true,
      anchorPosition: { x: 1234, y: 567 },
    };
    saveConfig(store, config);
    expect(loadConfig(store)).toEqual(config);
  });

  // T16
  it('配置文件内容为非法文本时返回全部缺省值并且不抛出异常', () => {
    const store = new MemoryStore();
    store.seed('{ 这不是 JSON');
    expect(loadConfig(store)).toEqual(DEFAULT_CONFIG);
  });

  it('配置文件不存在时返回全部缺省值', () => {
    expect(loadConfig(new MemoryStore())).toEqual(DEFAULT_CONFIG);
  });

  it('字段缺失时用缺省值补齐，已经存在的字段保留文件中的取值', () => {
    const store = new MemoryStore();
    store.seed(JSON.stringify({ alwaysOnTop: false }));
    const config = loadConfig(store);
    expect(config.alwaysOnTop).toBe(false);
    expect(config.activeSkinId).toBe(DEFAULT_CONFIG.activeSkinId);
    expect(config.anchorPosition).toEqual(DEFAULT_CONFIG.anchorPosition);
  });

  it('字段类型错误时该字段回退到缺省值，其余字段保留', () => {
    const store = new MemoryStore();
    store.seed(JSON.stringify({ activeSkinId: 42, alwaysOnTop: false }));
    const config = loadConfig(store);
    expect(config.activeSkinId).toBe(DEFAULT_CONFIG.activeSkinId);
    expect(config.alwaysOnTop).toBe(false);
  });

  it('保存结果可以被 JSON 解析回等价对象，保证跨进程读写一致', () => {
    const store = new MemoryStore();
    const config: AppConfig = {
      activeSkinId: 'light',
      alwaysOnTop: true,
      autoStart: false,
      anchorPosition: { x: 10, y: 20 },
    };
    saveConfig(store, config);
    const raw = store.read();
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? 'null')).toEqual(config);
  });

  it('开机自启缺省为关，文件中的布尔值会覆盖缺省值', () => {
    expect(loadConfig(new MemoryStore()).autoStart).toBe(false);

    const store = new MemoryStore();
    store.seed(JSON.stringify({ autoStart: true }));
    expect(loadConfig(store).autoStart).toBe(true);
  });

  it('开机自启字段类型错误时回退到缺省值', () => {
    const store = new MemoryStore();
    store.seed(JSON.stringify({ autoStart: 'yes' }));
    expect(loadConfig(store).autoStart).toBe(false);
  });
});
