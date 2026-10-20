import { describe, expect, it } from 'vitest';
import { loadSkin } from '../../src/core/skin/validate';
import type { SkinSource } from '../../src/core/skin/validate';
import type { SkinLoadResult } from '../../src/core/skin/types';
import {
  frameFilesOf,
  validManifest,
  withFps,
  withoutAnimation,
} from '../fixtures/skin';

/**
 * 构造皮肤加载源。exists 由清单中引用到的帧文件集合减去 missing 集合得到，
 * 因此测试不访问真实文件系统。
 */
function sourceOf(
  manifest: unknown,
  options: { missing?: string[]; id?: string } = {},
): SkinSource {
  const manifestForFiles = validManifest();
  const referenced =
    typeof manifest === 'object' && manifest !== null && 'animations' in manifest
      ? frameFilesOf(manifest as ReturnType<typeof validManifest>)
      : frameFilesOf(manifestForFiles);
  const missing = new Set(options.missing ?? []);
  return {
    id: options.id ?? 'placeholder',
    manifestText: JSON.stringify(manifest),
    exists: (relativePath: string) => referenced.includes(relativePath) && !missing.has(relativePath),
  };
}

function expectFailure(
  result: SkinLoadResult,
  code: string,
  reasonFragment: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.code).toBe(code);
  expect(result.reason).toContain(reasonFragment);
}

describe('皮肤清单校验器', () => {
  it('合法的清单可以加载，并且得到画布、锚点与命中区域', () => {
    const result = loadSkin(sourceOf(validManifest()));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.skin.canvas).toEqual({ width: 64, height: 64 });
    expect(result.skin.anchor).toEqual({ x: 32, y: 64 });
    expect(result.skin.hitbox).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(result.skin.animations.idle?.frames).toHaveLength(2);
  });

  // T1
  it('缺少待机动画时拒绝加载，并给出规则 S4 的原因文本', () => {
    const manifest = withoutAnimation(validManifest(), 'idle');
    expectFailure(loadSkin(sourceOf(manifest)), 'S4', '待机动画');
  });

  // T2
  it('帧率为零时拒绝加载，并给出规则 S5 的原因文本', () => {
    const manifest = withFps(validManifest(), 'idle', 0);
    expectFailure(loadSkin(sourceOf(manifest)), 'S5', '帧率');
  });

  // T3
  it('帧文件缺失时拒绝加载，并在原因中给出缺失文件的具体路径', () => {
    const manifest = validManifest();
    const result = loadSkin(sourceOf(manifest, { missing: ['images/drag_1.png'] }));
    expectFailure(result, 'S7', 'images/drag_1.png');
  });

  // T4
  it('锚点坐标超出画布范围时拒绝加载，并给出规则 S8 的原因文本', () => {
    const manifest = validManifest({ anchor: { x: 96, y: 64 } });
    expectFailure(loadSkin(sourceOf(manifest)), 'S8', '锚点');
  });

  it('皮肤标识与目录名不一致时拒绝加载，并给出规则 S3 的原因文本', () => {
    const manifest = validManifest({ id: 'other' });
    expectFailure(loadSkin(sourceOf(manifest)), 'S3', '标识');
  });

  it('清单文件内容不是合法 JSON 时拒绝加载，并给出规则 S1 的原因文本', () => {
    const source: SkinSource = {
      id: 'placeholder',
      manifestText: '{ 不是合法 JSON',
      exists: () => true,
    };
    expectFailure(loadSkin(source), 'S1', '清单');
  });
});
