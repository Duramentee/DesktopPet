import { describe, expect, it } from 'vitest';
import { FetchSkinRepository } from '../../src/platform/skins';
import type { SkinRepositoryBackend } from '../../src/platform/skins';
import { validManifest } from '../fixtures/skin';

interface BackendOptions {
  index?: string | null;
  missingImages?: string[];
  missingManifest?: boolean;
}

function backendOf(options: BackendOptions = {}): SkinRepositoryBackend {
  const manifestText = JSON.stringify(validManifest({ id: 'default' }));
  const missingImages = new Set(options.missingImages ?? []);
  return {
    fetchText: async (relativePath) => {
      if (relativePath === 'index.json') {
        if ('index' in options) {
          return options.index ?? null;
        }
        return JSON.stringify({ skins: [{ id: 'default', displayName: '占位皮肤' }] });
      }
      if (relativePath === 'default/skin.json') {
        return options.missingManifest === true ? null : manifestText;
      }
      return null;
    },
    canLoadImage: async (relativePath) => !missingImages.has(relativePath),
    baseUrlOf: (id) => `skins/${id}/`,
    log: () => {},
  };
}

describe('皮肤仓库', () => {
  it('列出索引文件中声明的皮肤', async () => {
    const repository = new FetchSkinRepository(backendOf());
    expect(await repository.list()).toEqual([{ id: 'default', displayName: '占位皮肤' }]);
  });

  it('索引文件缺失时返回空列表，不抛出异常', async () => {
    const repository = new FetchSkinRepository(
      backendOf({ index: null }),
    );
    expect(await repository.list()).toEqual([]);
  });

  it('清单元数据合法时返回可用皮肤与资源基准路径', async () => {
    const repository = new FetchSkinRepository(backendOf());
    const outcome = await repository.load('default');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.skin.manifest.id).toBe('default');
    expect(outcome.baseUrl).toBe('skins/default/');
  });

  it('清单文件无法读取时返回规则 S1 的失败结果', async () => {
    const repository = new FetchSkinRepository(backendOf({ missingManifest: true }));
    const outcome = await repository.load('default');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe('S1');
  });

  it('帧图片无法加载时返回规则 S7 的失败结果，并给缺失路径', async () => {
    const repository = new FetchSkinRepository(
      backendOf({ missingImages: ['default/images/drag_1.png'] }),
    );
    const outcome = await repository.load('default');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe('S7');
    expect(outcome.reason).toContain('drag_1.png');
  });
});
