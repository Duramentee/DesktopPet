import { describe, expect, it } from 'vitest';
import { FetchSkinRepository } from '../../src/platform/skins';
import type { SkinRepositoryBackend } from '../../src/platform/skins';
import { validManifest } from '../fixtures/skin';

interface BackendOptions {
  index?: string | null;
  missingImages?: string[];
  missingManifest?: boolean;
  userIds?: string[];
  /** 以相对路径为键的用户目录清单文本。 */
  userManifests?: Record<string, string>;
}

function backendOf(options: BackendOptions = {}): SkinRepositoryBackend {
  const bundledManifest = JSON.stringify(validManifest({ id: 'default' }));
  const missingImages = new Set(options.missingImages ?? []);
  return {
    fetchText: async (relativePath) => {
      if (relativePath === 'index.json') {
        if ('index' in options) {
          return options.index === null || options.index === undefined
            ? null
            : { text: options.index, base: 'bundled/' };
        }
        return {
          text: JSON.stringify({ skins: [{ id: 'default', displayName: '占位皮肤' }] }),
          base: 'bundled/',
        };
      }
      const userText = options.userManifests?.[relativePath];
      if (userText !== undefined) {
        return { text: userText, base: 'user/' };
      }
      if (relativePath === 'default/skin.json' && options.missingManifest !== true) {
        return { text: bundledManifest, base: 'bundled/' };
      }
      return null;
    },
    canLoadImage: async (relativePath) => !missingImages.has(relativePath),
    userSkinIds: async () => options.userIds ?? [],
    log: () => {},
  };
}

describe('皮肤仓库', () => {
  it('列出索引文件中声明的皮肤', async () => {
    const repository = new FetchSkinRepository(backendOf());
    expect(await repository.list()).toEqual([{ id: 'default', displayName: '占位皮肤' }]);
  });

  it('索引文件缺失时仍能列出用户目录中的皮肤', async () => {
    const repository = new FetchSkinRepository(
      backendOf({
        index: null,
        userIds: ['local'],
        userManifests: {
          'local/skin.json': JSON.stringify(validManifest({ id: 'local', displayName: '本地皮肤' })),
        },
      }),
    );
    expect(await repository.list()).toEqual([{ id: 'local', displayName: '本地皮肤' }]);
  });

  it('同名的用户皮肤覆盖内置条目，并保留内置顺序', async () => {
    const repository = new FetchSkinRepository(
      backendOf({
        userIds: ['default', 'extra'],
        userManifests: {
          'default/skin.json': JSON.stringify(validManifest({ id: 'default', displayName: '覆盖后' })),
          'extra/skin.json': JSON.stringify(validManifest({ id: 'extra', displayName: '额外皮肤' })),
        },
      }),
    );
    expect(await repository.list()).toEqual([
      { id: 'default', displayName: '覆盖后' },
      { id: 'extra', displayName: '额外皮肤' },
    ]);
  });

  it('用户目录中的清单无法读取时仍列出标识，避免皮肤凭空消失', async () => {
    const repository = new FetchSkinRepository(backendOf({ userIds: ['broken'] }));
    expect(await repository.list()).toEqual([
      { id: 'default', displayName: '占位皮肤' },
      { id: 'broken', displayName: 'broken' },
    ]);
  });

  it('清单元数据合法时返回可用皮肤与资源基准路径', async () => {
    const repository = new FetchSkinRepository(backendOf());
    const outcome = await repository.load('default');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.skin.manifest.id).toBe('default');
    expect(outcome.baseUrl).toBe('bundled/default/');
  });

  it('用户目录中的同名皮肤优先，基准路径指向用户目录', async () => {
    const repository = new FetchSkinRepository(
      backendOf({
        userIds: ['default'],
        userManifests: {
          'default/skin.json': JSON.stringify(validManifest({ id: 'default' })),
        },
      }),
    );
    const outcome = await repository.load('default');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.baseUrl).toBe('user/default/');
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

  it('预览地址取待机动画的第一帧，并拼在皮肤资源目录下', async () => {
    const repository = new FetchSkinRepository(backendOf());
    expect(await repository.previewUrl('default')).toBe('bundled/default/images/idle_0.png');
  });

  it('清单无法读取时预览地址为空', async () => {
    const repository = new FetchSkinRepository(backendOf({ missingManifest: true }));
    expect(await repository.previewUrl('default')).toBeNull();
  });

  it('预览地址可以带版本号，供热加载后刷新预览图', async () => {
    const repository = new FetchSkinRepository(backendOf());
    expect(await repository.previewUrl('default', '3')).toBe(
      'bundled/default/images/idle_0.png?v=3',
    );
  });

  it('概况给出画布尺寸与两个动画的帧数', async () => {
    const repository = new FetchSkinRepository(backendOf());
    expect(await repository.describe('default')).toEqual({
      canvas: { width: 64, height: 64 },
      idleFrames: 2,
      dragFrames: 2,
    });
  });

  it('清单无法读取时概况为空', async () => {
    const repository = new FetchSkinRepository(backendOf({ missingManifest: true }));
    expect(await repository.describe('default')).toBeNull();
  });

  it('清单格式非法时概况为空而不是抛异常', async () => {
    const repository = new FetchSkinRepository(
      backendOf({ userManifests: { 'broken/skin.json': '{ 不是 JSON' } }),
    );
    expect(await repository.describe('broken')).toBeNull();
  });
});
