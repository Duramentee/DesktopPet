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
import { IdleMotion } from '../../src/core/animation/idle-motion';
import { loadSkin } from '../../src/core/skin/validate';
import type { Point, Rect, Skin } from '../../src/core/skin/types';
import { validManifest } from '../fixtures/skin';

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

/** 夹具皮肤的锚点为 (32, 64)，因此锚点位置 (500, 600) 对应窗口左上角 (468, 536)。 */
const START_CONFIG: AppConfig = {
  activeSkinId: 'default',
  alwaysOnTop: false,
  autoStart: false,
  idleMotion: true,
  scale: 1,
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
  scales: number[] = [];
  skinScales: number[] = [];
  opaque: (frameFile: string, point: Point) => boolean = () => true;

  prepareSkin(skin: Skin, baseUrl: string): void {
    this.prepared = { skinId: skin.manifest.id, baseUrl };
  }

  setScale(scale: number): void {
    this.scales.push(scale);
  }

  setSkinScale(scale: number): void {
    this.skinScales.push(scale);
  }

  isOpaqueAt(frameFile: string, point: Point): boolean {
    return this.opaque(frameFile, point);
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
  ignored: boolean[] = [];
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

  setIgnoreCursorEvents(value: boolean): void {
    this.ignored.push(value);
    this.events.push('setIgnoreCursorEvents');
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
  constructor(readonly outcomes: Record<string, SkinLoadOutcome>) {}

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
  skins: FakeSkins;
  autostart: FakeAutostart;
  events: string[];
}

async function harness(options: {
  config?: AppConfig;
  outcomes?: Record<string, SkinLoadOutcome>;
  workAreas?: Rect[];
  autoStartEnabled?: boolean;
  onSkinFailure?: (message: string) => void;
} = {}): Promise<Harness> {
  const events: string[] = [];
  const renderer = new FakeRenderer();
  const windowBackend = new FakeWindow(events);
  const storage = new FakeStorage(options.config ?? START_CONFIG, events);
  const skins = new FakeSkins(options.outcomes ?? { default: okOutcome() });
  const autostart = new FakeAutostart(options.autoStartEnabled ?? false);
  const idleMotion = new IdleMotion({
    breathPeriodMs: 1000,
    breathAmplitude: 0.04,
    glanceIntervalMs: [1000, 1000],
    random: () => 0,
  });
  const controller = new PetController({
    renderer,
    window: windowBackend,
    storage,
    skins,
    autostart,
    idleMotion,
    workAreas: () => options.workAreas ?? [PRIMARY],
    fallbackSkinId: 'default',
    onSkinFailure: options.onSkinFailure,
  });
  await controller.start();
  return { controller, renderer, window: windowBackend, storage, skins, autostart, events };
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

  it('回退到备用皮肤时把失败原因报给调用方', async () => {
    const messages: string[] = [];
    await harness({
      config: { ...START_CONFIG, activeSkinId: 'missing' },
      outcomes: {
        default: okOutcome(),
        missing: { ok: false, code: 'S1', reason: '皮肤 missing 的清单文件无法读取' },
      },
      onSkinFailure: (message) => messages.push(message),
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('S1');
    expect(messages[0]).toContain('missing');
  });

  it('皮肤正常加载时不报失败', async () => {
    const messages: string[] = [];
    await harness({ onSkinFailure: (message) => messages.push(message) });
    expect(messages).toHaveLength(0);
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

  it('系统拖拽期间只回写锚点，不反向设置窗口位置，也不写磁盘', async () => {
    const h = await harness();
    h.controller.pointerDown({ x: 498, y: 586 });
    const positionsBefore = h.window.positions.length;
    const savedBefore = h.storage.saved.length;

    h.controller.handleWindowMoved({ x: 1000, y: 900 });

    expect(h.controller.anchorPosition()).toEqual({ x: 1032, y: 964 });
    expect(h.window.positions).toHaveLength(positionsBefore);
    expect(h.storage.saved).toHaveLength(savedBefore);
  });

  it('拖拽结束后把最终锚点写回配置，窗口对齐到夹紧后的位置', async () => {
    const h = await harness();
    h.controller.pointerDown({ x: 498, y: 586 });
    h.controller.handleWindowMoved({ x: 1000, y: 900 });
    await h.controller.pointerUp();

    expect(h.controller.isDragging()).toBe(false);
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 1032, y: 964 });
    expect(h.window.positions.at(-1)).toEqual({ x: 1000, y: 900 });
  });

  it('没有处于拖拽状态时结束拖拽只补写当前锚点，不改变位置', async () => {
    const h = await harness();
    const positionsBefore = h.window.positions.length;

    await h.controller.pointerUp();

    expect(h.controller.anchorPosition()).toEqual({ x: 500, y: 600 });
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 500, y: 600 });
    expect(h.window.positions.at(-1)).toEqual({ x: 468, y: 536 });
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

  it('重新加载当前皮肤时重新准备资源，位置按皮肤锚点重新对齐', async () => {
    const h = await harness();
    h.renderer.prepared = null;
    const switched = await h.controller.reloadActiveSkin();
    expect(switched).toBe(true);
    expect(h.renderer.prepared).toEqual({ skinId: 'default', baseUrl: 'skins/default/' });
    expect(h.window.positions.at(-1)).toEqual({ x: 468, y: 536 });
  });

  it('皮肤包被删除后重新加载失败，保留当前皮肤不变', async () => {
    const h = await harness();
    const prepared = h.renderer.prepared;
    delete h.skins.outcomes['default'];

    expect(await h.controller.reloadActiveSkin()).toBe(false);
    expect(h.renderer.prepared).toBe(prepared);
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

  it('帧与位姿都没变时不重复绘制', async () => {
    const h = await harness();
    await h.controller.toggleIdleMotion();
    const before = h.renderer.frames.length;
    for (let index = 0; index < 5; index += 1) {
      h.controller.tick(10);
    }
    expect(h.renderer.frames).toHaveLength(before);
  });

  it('帧推进后重画一次，跳过的重复绘制不影响换帧', async () => {
    const h = await harness();
    await h.controller.toggleIdleMotion();
    h.controller.tick(10);
    const before = h.renderer.frames.length;
    // 夹具皮肤每帧一百毫秒，累计到一百毫秒正好换帧
    h.controller.tick(90);
    expect(h.renderer.frames).toHaveLength(before + 1);
    expect(h.renderer.lastFrame()?.frameFile).toBe('images/idle_1.png');
  });

  it('切换皮肤后即使帧文件相同也重画一次', async () => {
    const h = await harness({
      outcomes: {
        default: okOutcome(),
        midnight: okOutcome('midnight'),
      },
    });
    const before = h.renderer.frames.length;
    expect(await h.controller.switchSkin('midnight')).toBe(true);
    expect(h.renderer.frames).toHaveLength(before + 1);
  });

  it('缩放变化后强制重画，避免画布后备存储重建后留空', async () => {
    const h = await harness();
    const before = h.renderer.frames.length;
    await h.controller.handleScaleChanged(2, { x: 468, y: 536 });
    expect(h.renderer.frames).toHaveLength(before + 1);
  });

  it('待机时推进呼吸，帧上带有非中立的纵向缩放', async () => {
    const h = await harness();
    h.controller.tick(500);
    expect(h.renderer.lastFrame()?.motion.scaleY).toBeCloseTo(0.96, 3);
    expect(h.renderer.lastFrame()?.motion.offsetX).toBe(0);
  });

  it('拖拽期间不推进小动作，位姿回到中立', async () => {
    const h = await harness();
    h.controller.tick(500);
    h.controller.pointerDown({ x: 498, y: 586 });
    expect(h.renderer.lastFrame()?.motion.scaleY).toBe(1);

    h.controller.tick(500);
    expect(h.renderer.lastFrame()?.motion.scaleY).toBe(1);
    expect(h.renderer.lastFrame()?.motion.offsetX).toBe(0);
  });

  it('关闭待机小动作后位姿保持中立并写入配置', async () => {
    const h = await harness();
    const enabled = await h.controller.toggleIdleMotion();
    expect(enabled).toBe(false);
    expect(h.storage.saved.at(-1)?.idleMotion).toBe(false);
    expect(h.controller.idleMotionEnabled()).toBe(false);

    h.controller.tick(500);
    expect(h.renderer.lastFrame()?.motion.scaleY).toBe(1);
  });

  it('把屏幕坐标换算成画布坐标后交给渲染层判断是否落在宠物像素上', async () => {
    const h = await harness();
    const calls: { frameFile: string; point: Point }[] = [];
    h.renderer.opaque = (frameFile, point) => {
      calls.push({ frameFile, point });
      return point.x >= 20 && point.x <= 40;
    };
    // 锚点 (500, 600) 减去锚点偏移 (32, 64) 得到窗口左上角 (468, 536)
    expect(h.controller.isPointOnPet({ x: 488, y: 566 })).toBe(true);
    expect(h.controller.isPointOnPet({ x: 450, y: 566 })).toBe(false);
    expect(calls[0]).toEqual({ frameFile: 'images/idle_0.png', point: { x: 20, y: 30 } });
  });

  it('渲染层没有透明度查询时按整块画布可交互处理', async () => {
    const h = await harness();
    (h.renderer as { isOpaqueAt?: unknown }).isOpaqueAt = undefined;
    expect(h.controller.isPointOnPet({ x: 0, y: 0 })).toBe(true);
  });

  it('命中判定按当前位姿反算回帧坐标，抵消呼吸的纵向缩放', async () => {
    const h = await harness();
    const calls: Point[] = [];
    h.renderer.opaque = (_frameFile, point) => {
      calls.push(point);
      return true;
    };
    h.controller.tick(500);
    const motion = h.renderer.lastFrame()?.motion;
    expect(motion?.scaleY).not.toBe(1);
    h.controller.isPointOnPet({ x: 488, y: 566 });
    // 画布坐标是 (20, 30)，反算后 y 会按底边基准拉回帧坐标（夹具画布高 64）
    const expectedY = 64 + (30 - 64 - (motion?.offsetY ?? 0)) / (motion?.scaleY ?? 1);
    expect(calls[0]?.x).toBeCloseTo(20 - (motion?.offsetX ?? 0), 6);
    expect(calls[0]?.y).toBeCloseTo(expectedY, 6);
    expect(calls[0]?.y).not.toBeCloseTo(30, 1);
  });

  it('命中判定按显示倍率把屏幕坐标换算成画布坐标', async () => {
    const h = await harness({ config: { ...START_CONFIG, scale: 2 } });
    await h.controller.toggleIdleMotion();
    const calls: Point[] = [];
    h.renderer.opaque = (_frameFile, point) => {
      calls.push(point);
      return true;
    };
    // 倍率 2 时锚点偏移翻倍，窗口左上角是 (436, 472)
    expect(h.window.positions.at(-1)).toEqual({ x: 436, y: 472 });
    h.controller.isPointOnPet({ x: 476, y: 532 });
    expect(calls[0]).toEqual({ x: 20, y: 30 });
  });

  it('启动时按配置的显示倍率设置窗口尺寸与位置', async () => {
    const h = await harness({ config: { ...START_CONFIG, scale: 1.25 } });
    expect(h.window.sizes).toEqual([{ width: 80, height: 80 }]);
    expect(h.window.positions).toEqual([{ x: 460, y: 520 }]);
    expect(h.renderer.skinScales).toEqual([1.25]);
  });

  it('放大宠物一档：窗口与画布同步放大，锚点位置不动', async () => {
    const h = await harness();
    const scale = await h.controller.stepScale('up');
    expect(scale).toBe(1.25);
    expect(h.controller.currentScale()).toBe(1.25);
    expect(h.window.sizes.at(-1)).toEqual({ width: 80, height: 80 });
    expect(h.window.positions.at(-1)).toEqual({ x: 460, y: 520 });
    expect(h.renderer.skinScales.at(-1)).toBe(1.25);
    expect(h.storage.saved.at(-1)?.scale).toBe(1.25);
    // 锚点没有变，宠物站的仍然是原来那个点
    expect(h.controller.anchorPosition()).toEqual({ x: 500, y: 600 });
  });

  it('倍率到上限或下限时不再变化', async () => {
    const h = await harness();
    expect(await h.controller.stepScale('down')).toBe(0.75);
    expect(await h.controller.stepScale('down')).toBe(0.75);
    await h.controller.stepScale('up');
    await h.controller.stepScale('up');
    await h.controller.stepScale('up');
    expect(await h.controller.stepScale('up')).toBe(2);
    expect(await h.controller.stepScale('up')).toBe(2);
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

  it('缩放比例变化后按新比例回写锚点，并刷新画布与窗口尺寸', async () => {
    const h = await harness();
    // 逻辑 (468, 536) 加上锚点偏移 (32, 64) 还原出锚点 (500, 600)
    await h.controller.handleScaleChanged(2, { x: 468, y: 536 });
    expect(h.renderer.scales).toEqual([2]);
    expect(h.controller.anchorPosition()).toEqual({ x: 500, y: 600 });
    expect(h.window.sizes.at(-1)).toEqual({ width: 64, height: 64 });
    expect(h.window.positions.at(-1)).toEqual({ x: 468, y: 536 });
    expect(h.storage.saved.at(-1)?.anchorPosition).toEqual({ x: 500, y: 600 });
  });
});
