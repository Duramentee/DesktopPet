import { describe, expect, it } from 'vitest';
import { PetController } from '../../src/app/controller';
import type {
  RenderFrame,
  Renderer,
  SkinLoadOutcome,
  SkinRepository,
  SkinSummary,
  Storage,
  WindowBackend,
} from '../../src/app/controller';
import type { AppConfig } from '../../src/core/config/schema';
import type { Autostart } from '../../src/platform/autostart';
import { loadSkin } from '../../src/core/skin/validate';
import type { Point, Rect, Skin } from '../../src/core/skin/types';
import { validManifest } from '../fixtures/skin';

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

/** 夹具皮肤的锚点为 (32, 64)，因此锚点位置 (500, 600) 对应窗口左上角 (468, 536)。 */
const START_CONFIG: AppConfig = {
  activeSkinId: 'default',
  alwaysOnTop: false,
  autoStart: false,
  anchorPosition: { x: 500, y: 600 },
};

function okOutcome(id = 'default', manifest = validManifest({ id })): SkinLoadOutcome {
  const result = loadSkin({
    id,
    manifestText: JSON.stringify(manifest),
    exists: () => true,
  });
  if (!result.ok) {
    throw new Error(`夹具皮肤加载失败：${result.reason}`);
  }
  return { ok: true, skin: result.skin, baseUrl: `skins/${id}/` };
}

class FakeRenderer implements Renderer {
  prepared: { skinId: string; baseUrl: string } | null = null;
  frames: RenderFrame[] = [];

  prepareSkin(skin: Skin, baseUrl: string): void {
    this.prepared = { skinId: skin.manifest.id, baseUrl };
  }

  draw(frame: RenderFrame): void {
    this.frames.push(frame);
  }

  lastFrame(): RenderFrame | undefined {
    return this.frames.at(-1);
  }
}

class FakeWindow implements WindowBackend {
  positions: Point[] = [];
  sizes: { width: number; height: number }[] = [];
  alwaysOnTop: boolean[] = [];
  quitCalls = 0;

  constructor(private readonly events: string[] = []) {}

  setTopLeft(point: Point): void {
    this.positions.push(point);
    this.events.push('setTopLeft');
  }

  setSize(width: number, height: number): void {
    this.sizes.push({ width, height });
    this.events.push('setSize');
  }

  setAlwaysOnTop(value: boolean): void {
    this.alwaysOnTop.push(value);
  }

  quit(): void {
    this.quitCalls += 1;
    this.events.push('quit');
  }
}

class FakeStorage implements Storage {
  saved: AppConfig[] = [];

  constructor(
    private config: AppConfig,
    private readonly events: string[] = [],
  ) {}

  load(): AppConfig {
    return { ...this.config, anchorPosition: { ...this.config.anchorPosition } };
  }

  save(config: AppConfig): void {
    this.saved.push(config);
    this.config = config;
    this.events.push('save');
  }
}

class FakeSkins implements SkinRepository {
  constructor(private readonly outcomes: Record<string, SkinLoadOutcome>) {}

  async list(): Promise<SkinSummary[]> {
    return Object.keys(this.outcomes).map((id) => ({ id, displayName: id }));
  }

  async load(id: string): Promise<SkinLoadOutcome> {
    return this.outcomes[id] ?? { ok: false, code: 'S1', reason: `皮肤 ${id} 不存在` };
  }
}

class FakeAutostart implements Autostart {
  enabled: boolean;
  setCalls: boolean[] = [];

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async setEnabled(value: boolean): Promise<void> {
    this.enabled = value;
    this.setCalls.push(value);
  }
}

interface Harness {
  controller: PetController;
  renderer: FakeRenderer;
  window: FakeWindow;
  storage: FakeStorage;
  autostart: FakeAutostart;
  events: string[];
}

async function harness(options: {
  config?: AppConfig;
  outcomes?: Record<string, SkinLoadOutcome>;
  workAreas?: Rect[];
  autoStartEnabled?: boolean;
} = {}): Promise<Harness> {
  const events: string[] = [];
  const renderer = new FakeRenderer();
  const windowBackend = new FakeWindow(events);
  const storage = new FakeStorage(options.config ?? START_CONFIG, events);
  const skins = new FakeSkins(options.outcomes ?? { default: okOutcome() });
  const autostart = new FakeAutostart(options.autoStartEnabled ?? false);
  const controller = new PetController({
    renderer,
    window: windowBackend,
    storage,
    skins,
    autostart,
    workAreas: () => options.workAreas ?? [PRIMARY],
    fallbackSkinId: 'default',
  });
  await controller.start();
  return { controller, renderer, window: windowBackend, storage, autostart, events };
}

describe('应用层控制器', () => {
  it('启动时加载配置中的皮肤，恢复窗口位置与置顶状态，并绘制第一帧', async () => {
    const h = await harness();
    expect(h.renderer.prepared).toEqual({ skinId: 'default', baseUrl: 'skins/default/' });
    expect(h.window.positions).toEqual([{ x: 468, y: 536 }]);
    expect(h.window.sizes).toEqual([{ width: 64, height: 64 }]);
    expect(h.window.alwaysOnTop).toEqual([false]);
    expect(h.renderer.frames).toHaveLength(1);
    expect(h.renderer.lastFrame()?.frameFile).toBe('images/idle_0.png');
  });

  it('配置中的皮肤加载失败时回退到备用皮肤，并把回退结果写入配置', async () => {
    const h = await harness({
      config: { ...START_CONFIG, activeSkinId: 'missing' },
      outcomes: {
        default: okOutcome(),
        missing: { ok: false, code: 'S1', reason: '皮肤 missing 的清单文件无法读取' },
      },
    });
    expect(h.renderer.prepared?.skinId).toBe('default');
    expect(h.storage.saved.at(-1)?.activeSkinId).toBe('default');
  });

  it('所有皮肤都不可用时拒绝启动', async () => {
    await expect(
      harness({
        outcomes: {
          missing: { ok: false, code: 'S1', reason: '缺失' },
        },
        config: { ...START_CONFIG, activeSkinId: 'missing' },
      }),
    ).rejects.toThrow('没有可用的皮肤');
  });

  it('指针落在命中区域内时返回真，表示应当开始系统级拖动', async () => {
    const h = await harness();
    expect(h.controller.pointerDown({ x: 498, y: 586 })).toBe(true);
    expect(h.controller.snapshot().state).toBe('dragging');
  });

  it('指针落在命中区域之外时返回假，状态保持待机', async () => {
    const h = await harness();
    expect(h.controller.pointerDown({ x: 900, y: 900 })).toBe(false);
    expect(h.controller.snapshot().state).toBe('idle');
  });

  it('拖拽过程中不写入配置，松开鼠标后才写入最终位置', async () => {
    const h = await harness();
    h.controller.pointerDown({ x: 498, y: 586 });
    h.controller.pointerMove({ x: 700, y: 800 });
    expect(h.storage.saved).toHaveLength(0);

    await h.controller.pointerUp();
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 702, y: 814 });
    expect(h.window.positions.at(-1)).toEqual({ x: 670, y: 750 });
  });

  it('系统级拖动结束后回写窗口左上角坐标，并按锚点换算成锚点位置', async () => {
    const h = await harness();
    h.controller.pointerDown({ x: 498, y: 586 });
    await h.controller.syncTopLeft({ x: 1000, y: 900 });
    expect(h.controller.anchorPosition()).toEqual({ x: 1032, y: 964 });
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 1032, y: 964 });
  });

  it('位置超出屏幕工作区时被夹紧到工作区边界', async () => {
    const h = await harness();
    h.controller.pointerDown({ x: 498, y: 586 });
    h.controller.pointerMove({ x: 5000, y: 5000 });
    expect(h.controller.anchorPosition()).toEqual({ x: 1920, y: 1080 });
  });

  it('置顶开关翻转后调用窗口后端并写入配置', async () => {
    const h = await harness();
    const result = await h.controller.toggleAlwaysOnTop();
    expect(result).toBe(true);
    expect(h.window.alwaysOnTop.at(-1)).toBe(true);
    expect(h.storage.saved.at(-1)?.alwaysOnTop).toBe(true);
  });

  it('切换皮肤后渲染层重新准备资源，并且立即使用新皮肤的帧', async () => {
    const h = await harness({
      outcomes: {
        default: okOutcome(),
        midnight: okOutcome('midnight'),
      },
    });
    const switched = await h.controller.switchSkin('midnight');
    expect(switched).toBe(true);
    expect(h.renderer.prepared).toEqual({ skinId: 'midnight', baseUrl: 'skins/midnight/' });
    expect(h.renderer.lastFrame()?.frameFile).toBe('images/idle_0.png');
    expect(h.storage.saved.at(-1)?.activeSkinId).toBe('midnight');
  });

  it('切换到不存在的皮肤时保持当前皮肤不变', async () => {
    const h = await harness();
    const switched = await h.controller.switchSkin('missing');
    expect(switched).toBe(false);
    expect(h.renderer.prepared?.skinId).toBe('default');
  });

  it('时间推进后渲染层收到下一帧', async () => {
    const h = await harness();
    h.controller.tick(100);
    expect(h.renderer.lastFrame()?.frameFile).toBe('images/idle_1.png');
  });

  it('退出时先保存配置再关闭窗口', async () => {
    const h = await harness();
    await h.controller.quit();
    expect(h.events.slice(-2)).toEqual(['save', 'quit']);
    expect(h.window.quitCalls).toBe(1);
  });

  it('启动时把系统自启项同步成配置里的取值', async () => {
    const h = await harness({
      config: { ...START_CONFIG, autoStart: true },
      autoStartEnabled: false,
    });
    expect(h.autostart.setCalls).toEqual([true]);
    expect(h.autostart.enabled).toBe(true);
  });

  it('系统自启项与配置一致时不重复写系统', async () => {
    const h = await harness({
      config: { ...START_CONFIG, autoStart: true },
      autoStartEnabled: true,
    });
    expect(h.autostart.setCalls).toEqual([]);
  });

  it('翻转开机自启时同时改系统自启项与配置', async () => {
    const h = await harness();
    const enabled = await h.controller.toggleAutoStart();
    expect(enabled).toBe(true);
    expect(h.autostart.setCalls).toEqual([true]);
    expect(h.storage.saved.at(-1)?.autoStart).toBe(true);
    expect(h.controller.autoStartEnabled()).toBe(true);
  });

  it('显示器缩小后把宠物夹回新的工作区并写入配置', async () => {
    const h = await harness();
    const small: Rect = { x: 0, y: 0, width: 320, height: 240 };
    await h.controller.applyWorkAreas([small]);
    // 夹具锚点为 (500, 600)，缩到 320x240 后应贴到右下角
    expect(h.controller.anchorPosition()).toEqual({ x: 320, y: 240 });
    expect(h.window.positions.at(-1)).toEqual({ x: 288, y: 176 });
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 320, y: 240 });
  });

  it('显示器布局变化但没有影响位置时不产生额外写入', async () => {
    const h = await harness();
    const savedBefore = h.storage.saved.length;
    const positionsBefore = h.window.positions.length;
    await h.controller.applyWorkAreas([{ x: 0, y: 0, width: 1920, height: 1080 }]);
    expect(h.controller.anchorPosition()).toEqual({ x: 500, y: 600 });
    expect(h.storage.saved).toHaveLength(savedBefore);
    expect(h.window.positions).toHaveLength(positionsBefore);
  });
});
