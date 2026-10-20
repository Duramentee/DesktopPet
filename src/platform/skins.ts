/**
 * 平台适配层：皮肤仓库。
 *
 * 皮肤包随程序一起分发，位于程序资源目录的 skins 子目录下。
 * 本文件通过 fetch 读取清单文本、通过图片预载判断帧文件是否存在，
 * 然后把结果交给领域层的校验器，因此校验规则只有一份实现。
 */

import type { SkinLoadOutcome, SkinRepository, SkinSummary } from '../app/controller';
import { loadSkin } from '../core/skin/validate';

export interface SkinRepositoryBackend {
  /** 读取相对路径的文本内容，读取失败时返回 null。 */
  fetchText(relativePath: string): Promise<string | null>;
  /** 判断相对路径的图片能否加载成功。 */
  canLoadImage(relativePath: string): Promise<boolean>;
  /** 某份皮肤的资源基准路径，以斜杠结尾，供渲染层拼接帧文件路径。 */
  baseUrlOf(id: string): string;
  /** 记录非致命错误。 */
  log(message: string, error?: unknown): void;
}

interface SkinIndexFile {
  skins?: Array<{ id?: unknown; displayName?: unknown }>;
}

export class FetchSkinRepository implements SkinRepository {
  private readonly backend: SkinRepositoryBackend;

  constructor(backend: SkinRepositoryBackend) {
    this.backend = backend;
  }

  async list(): Promise<SkinSummary[]> {
    const text = await this.backend.fetchText('index.json');
    if (text === null) {
      this.backend.log('皮肤索引文件缺失，皮肤菜单将为空');
      return [];
    }
    let parsed: SkinIndexFile;
    try {
      parsed = JSON.parse(text) as SkinIndexFile;
    } catch (error) {
      this.backend.log('皮肤索引文件格式非法', error);
      return [];
    }
    const entries = Array.isArray(parsed.skins) ? parsed.skins : [];
    const summaries: SkinSummary[] = [];
    for (const entry of entries) {
      if (typeof entry.id === 'string' && entry.id.length > 0) {
        summaries.push({
          id: entry.id,
          displayName: typeof entry.displayName === 'string' ? entry.displayName : entry.id,
        });
      }
    }
    return summaries;
  }

  async load(id: string): Promise<SkinLoadOutcome> {
    const manifestText = await this.backend.fetchText(`${id}/skin.json`);
    if (manifestText === null) {
      return { ok: false, code: 'S1', reason: `皮肤 ${id} 的清单文件无法读取` };
    }
    const frameFiles = extractFrameFiles(manifestText);
    const available = new Map<string, boolean>();
    await Promise.all(
      frameFiles.map(async (file) => {
        available.set(file, await this.backend.canLoadImage(`${id}/${file}`));
      }),
    );
    const result = loadSkin({
      id,
      manifestText,
      exists: (file) => available.get(file) === true,
    });
    if (result.ok) {
      return { ok: true, skin: result.skin, baseUrl: this.backend.baseUrlOf(id) };
    }
    this.backend.log(`皮肤 ${id} 校验失败：${result.code} ${result.reason}`);
    return { ok: false, code: result.code, reason: result.reason };
  }

  /** 皮肤待机动画第一帧的地址，供皮肤管理窗口做预览。读取失败时返回 null。 */
  async previewUrl(id: string): Promise<string | null> {
    const manifestText = await this.backend.fetchText(`${id}/skin.json`);
    if (manifestText === null) {
      return null;
    }
    const file = firstIdleFrame(manifestText);
    if (file === null) {
      return null;
    }
    // 基准路径一律以斜杠结尾，直接拼接即可，不依赖它是否是可解析的绝对地址
    return `${this.backend.baseUrlOf(id)}${file}`;
  }
}

/**
 * 从清单文本中尽力提取帧文件路径。
 * 该函数只用于决定需要预载哪些图片，因此对非法输入保持沉默，
 * 真正的格式错误由领域层校验器报告。
 */
function extractFrameFiles(manifestText: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return [];
  }
  const animations = (parsed as { animations?: unknown }).animations;
  if (typeof animations !== 'object' || animations === null) {
    return [];
  }
  const files = new Set<string>();
  for (const animation of Object.values(animations as Record<string, unknown>)) {
    if (typeof animation !== 'object' || animation === null) {
      continue;
    }
    const frames = (animation as { frames?: unknown }).frames;
    if (!Array.isArray(frames)) {
      continue;
    }
    for (const frame of frames) {
      if (typeof frame === 'object' && frame !== null) {
        const file = (frame as { file?: unknown }).file;
        if (typeof file === 'string' && file.length > 0) {
          files.add(file);
        }
      }
    }
  }
  return [...files];
}

/**
 * 尽力取出待机动画的第一帧路径。
 * 只用于预览，因此对非法输入保持沉默，真正的格式错误由领域层校验器报告。
 */
function firstIdleFrame(manifestText: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return null;
  }
  const animations = (parsed as { animations?: { idle?: { frames?: unknown } } }).animations;
  const frames = animations?.idle?.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }
  const first = frames[0];
  if (typeof first !== 'object' || first === null) {
    return null;
  }
  const file = (first as { file?: unknown }).file;
  return typeof file === 'string' && file.length > 0 ? file : null;
}

/** 创建基于 fetch 与图片预载的皮肤仓库。只能在 WebView 环境中调用。 */export async function createFetchSkinRepository(): Promise<FetchSkinRepository> {
  const base = new URL('skins/', document.baseURI).href;
  const log = (message: string, error?: unknown): void => {
    console.warn(`[skins] ${message}`, error ?? '');
  };
  const backend: SkinRepositoryBackend = {
    fetchText: async (relativePath) => {
      try {
        const response = await fetch(new URL(relativePath, base).href);
        return response.ok ? await response.text() : null;
      } catch (error) {
        log(`读取 ${relativePath} 失败`, error);
        return null;
      }
    },
    canLoadImage: (relativePath) =>
      new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = new URL(relativePath, base).href;
      }),
    baseUrlOf: (id) => new URL(`${id}/`, base).href,
    log,
  };
  return new FetchSkinRepository(backend);
}

/** 打开皮肤管理窗口。窗口由配置预创建为隐藏状态，这里只负责显示与聚焦。 */
export async function openSkinManager(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('show_skins_window');
}

/** 隐藏皮肤管理窗口，保留窗口实例以便再次打开。 */
export async function hideSkinManager(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_skins_window');
}
