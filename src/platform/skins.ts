/**
 * 平台适配层：皮肤仓库。
 *
 * 皮肤包随程序一起分发，位于程序资源目录的 skins 子目录下。
 * 本文件通过 fetch 读取清单文本、通过图片预载判断帧文件是否存在，
 * 然后把结果交给领域层的校验器，因此校验规则只有一份实现。
 */

import type { SkinLoadOutcome, SkinRepository, SkinSummary } from '../app/controller';
import { loadSkin } from '../core/skin/validate';
import { pollForChanges } from './poller';

export interface SkinFile {
  text: string;
  /** 该文件所在根目录的基准地址，以斜杠结尾。 */
  base: string;
}

export interface SkinRepositoryBackend {
  /** 读取相对路径的文本内容，按根目录优先级查找，全部落空时返回 null。 */
  fetchText(relativePath: string): Promise<SkinFile | null>;
  /** 判断相对路径的图片能否加载成功，同样按根目录优先级查找。 */
  canLoadImage(relativePath: string): Promise<boolean>;
  /** 用户目录中额外存在的皮肤标识；没有平台支持时省略。 */
  userSkinIds?: () => Promise<string[]>;
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

  /**
   * 合并内置索引与用户目录：内置皮肤排在前面，同名时用户目录的清单优先，
   * 这样把一份皮肤放进用户目录即可覆盖内置版本而不用重新打包。
   */
  async list(): Promise<SkinSummary[]> {
    const summaries = new Map<string, SkinSummary>();
    const indexFile = await this.backend.fetchText('index.json');
    if (indexFile === null) {
      this.backend.log('皮肤索引文件缺失，只能列出用户目录中的皮肤');
    } else {
      let parsed: SkinIndexFile;
      try {
        parsed = JSON.parse(indexFile.text) as SkinIndexFile;
      } catch (error) {
        this.backend.log('皮肤索引文件格式非法', error);
        parsed = {};
      }
      const entries = Array.isArray(parsed.skins) ? parsed.skins : [];
      for (const entry of entries) {
        if (typeof entry.id === 'string' && entry.id.length > 0) {
          summaries.set(entry.id, {
            id: entry.id,
            displayName: typeof entry.displayName === 'string' ? entry.displayName : entry.id,
          });
        }
      }
    }

    const userIds = (await this.backend.userSkinIds?.()) ?? [];
    for (const id of userIds) {
      const manifest = await this.backend.fetchText(`${id}/skin.json`);
      const displayName = manifest === null ? id : displayNameOf(manifest.text) ?? id;
      summaries.set(id, { id, displayName });
    }
    return [...summaries.values()];
  }

  async load(id: string): Promise<SkinLoadOutcome> {
    const manifest = await this.backend.fetchText(`${id}/skin.json`);
    if (manifest === null) {
      return { ok: false, code: 'S1', reason: `皮肤 ${id} 的清单文件无法读取` };
    }
    const frameFiles = extractFrameFiles(manifest.text);
    const available = new Map<string, boolean>();
    await Promise.all(
      frameFiles.map(async (file) => {
        available.set(file, await this.backend.canLoadImage(`${id}/${file}`));
      }),
    );
    const result = loadSkin({
      id,
      manifestText: manifest.text,
      exists: (file) => available.get(file) === true,
    });
    if (result.ok) {
      return { ok: true, skin: result.skin, baseUrl: `${manifest.base}${id}/` };
    }
    this.backend.log(`皮肤 ${id} 校验失败：${result.code} ${result.reason}`);
    return { ok: false, code: result.code, reason: result.reason };
  }

  /** 皮肤待机动画第一帧的地址，供皮肤管理窗口做预览。读取失败时返回 null。 */
  async previewUrl(id: string, version?: string): Promise<string | null> {
    const manifest = await this.backend.fetchText(`${id}/skin.json`);
    if (manifest === null) {
      return null;
    }
    const file = firstIdleFrame(manifest.text);
    if (file === null) {
      return null;
    }
    // 基准路径一律以斜杠结尾，直接拼接即可，不依赖它是否是可解析的绝对地址
    const suffix = version === undefined ? '' : `?v=${encodeURIComponent(version)}`;
    return `${manifest.base}${id}/${file}${suffix}`;
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

/** 从清单文本中取出展示名称，非字符串或空串时返回 null。 */
function displayNameOf(manifestText: string): string | null {
  try {
    const parsed = JSON.parse(manifestText) as { displayName?: unknown };
    return typeof parsed.displayName === 'string' && parsed.displayName.length > 0
      ? parsed.displayName
      : null;
  } catch {
    return null;
  }
}

/**
 * 用户皮肤目录的自定义协议地址。
 * Windows 上自定义协议映射为 `http://<scheme>.localhost`，其他平台为 `<scheme>://localhost`。
 */
export function userSkinBase(): string {
  const isHttpOrigin = typeof window !== 'undefined' && window.location.protocol === 'http:';
  return isHttpOrigin ? 'http://skin.localhost/' : 'skin://localhost/';
}

/** 创建基于 fetch 与图片预载的皮肤仓库。只能在 WebView 环境中调用。 */
export async function createFetchSkinRepository(): Promise<FetchSkinRepository> {
  const bundled = new URL('skins/', document.baseURI).href;
  // 用户目录优先：同名皮肤覆盖内置版本，新增皮肤不需要重新打包
  const roots = [userSkinBase(), bundled];
  const log = (message: string, error?: unknown): void => {
    console.warn(`[skins] ${message}`, error ?? '');
  };
  const backend: SkinRepositoryBackend = {
    fetchText: async (relativePath) => {
      for (const root of roots) {
        try {
          const response = await fetch(new URL(relativePath, root).href);
          if (response.ok) {
            return { text: await response.text(), base: root };
          }
        } catch {
          // 该根目录不可用，继续尝试下一个
        }
      }
      return null;
    },
    canLoadImage: async (relativePath) => {
      for (const root of roots) {
        const url = new URL(relativePath, root).href;
        const loaded = await new Promise<boolean>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = url;
        });
        if (loaded) {
          return true;
        }
      }
      return false;
    },
    userSkinIds: async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ids = await invoke<string[]>('user_skin_ids');
        return Array.isArray(ids) ? ids : [];
      } catch {
        return [];
      }
    },
    log,
  };
  return new FetchSkinRepository(backend);
}

/** 读取用户皮肤目录的内容指纹；没有平台支持时返回空串。 */
export async function readSkinsSignature(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const signature = await invoke<string>('skins_signature');
    return typeof signature === 'string' ? signature : '';
  } catch {
    return '';
  }
}

/**
 * 监听用户皮肤目录的变化，返回停止监听的函数。
 * 首次读取只建立基准，之后仅在指纹变化时触发一次回调。
 */
export function watchSkinChanges(
  onChange: () => Promise<void> | void,
  options: { signature?: () => Promise<string>; intervalMs?: number; onError?: (error: unknown) => void } = {},
): () => void {
  return pollForChanges({
    read: options.signature ?? readSkinsSignature,
    signature: (value) => value,
    onChange: () => onChange(),
    intervalMs: options.intervalMs ?? 2000,
    onError: options.onError,
    label: '皮肤目录',
  });
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
