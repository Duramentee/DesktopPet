import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSkin } from '../../src/core/skin/validate';
import type { SkinSource } from '../../src/core/skin/validate';

const SKIN_ROOT = join(process.cwd(), 'assets', 'skins');

function sourceOfSkin(id: string): SkinSource {
  const dir = join(SKIN_ROOT, id);
  const manifestPath = join(dir, 'skin.json');
  return {
    id,
    manifestText: existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null,
    exists: (relativePath: string) => existsSync(join(dir, relativePath)),
  };
}

function skinIds(): string[] {
  if (!existsSync(SKIN_ROOT)) {
    return [];
  }
  return readdirSync(SKIN_ROOT).filter((name) => statSync(join(SKIN_ROOT, name)).isDirectory());
}

describe('仓库内的真实皮肤包', () => {
  it('至少存在一份皮肤包', () => {
    expect(skinIds().length).toBeGreaterThan(0);
  });

  it('每一份皮肤包都能通过全部校验规则', () => {
    for (const id of skinIds()) {
      const result = loadSkin(sourceOfSkin(id));
      if (!result.ok) {
        throw new Error(`皮肤 ${id} 校验失败：${result.code} ${result.reason}`);
      }
      expect(result.ok).toBe(true);
    }
  });

  it('缺省皮肤包含待机与拖拽两个动画，并且帧数大于一', () => {
    const result = loadSkin(sourceOfSkin('default'));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.skin.animations['idle']?.frames.length).toBeGreaterThan(1);
    expect(result.skin.animations['drag']?.frames.length).toBeGreaterThan(1);
  });

  it('缺省皮肤的锚点位于画布底边中央，命中区域等于整个画布', () => {
    const result = loadSkin(sourceOfSkin('default'));
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.skin.anchor).toEqual({ x: 32, y: 64 });
    expect(result.skin.hitbox).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });

  it('皮肤目录中只包含清单文件与 images 子目录', () => {
    for (const id of skinIds()) {
      const entries = readdirSync(join(SKIN_ROOT, id)).sort();
      expect(entries).toEqual(['images', 'skin.json']);
    }
  });
});
