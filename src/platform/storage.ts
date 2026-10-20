/**
 * 平台适配层：配置持久化。
 *
 * 配置文本的读写交给 Rust 侧的 load_config 与 save_config 两个命令，
 * 本文件只负责把命令调用与领域层的序列化逻辑连接起来。
 */

import type { Storage } from '../app/controller';
import { parseConfig, serializeConfig } from '../core/config/schema';
import type { AppConfig } from '../core/config/schema';

export type CommandInvoker = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export class TauriStorage implements Storage {
  private readonly invoke: CommandInvoker;

  constructor(invoke: CommandInvoker) {
    this.invoke = invoke;
  }

  async load(): Promise<AppConfig> {
    try {
      const text = await this.invoke('load_config');
      return parseConfig(typeof text === 'string' ? text : null);
    } catch (error) {
      console.warn('[storage] 读取配置失败，改用缺省值', error);
      return parseConfig(null);
    }
  }

  async save(config: AppConfig): Promise<void> {
    try {
      await this.invoke('save_config', { text: serializeConfig(config) });
    } catch (error) {
      console.warn('[storage] 保存配置失败，本次改动不会持久化', error);
    }
  }
}

/** 创建绑定到 Tauri 命令接口的存储实现。只能在 WebView 环境中调用。 */
export async function createTauriStorage(): Promise<TauriStorage> {
  const { invoke } = await import('@tauri-apps/api/core');
  return new TauriStorage((command, args) => invoke<unknown>(command, args));
}
