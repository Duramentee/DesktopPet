/**
 * 应用层控制器。
 * 控制器把外部事件翻译成领域层命令，把领域层的状态变化翻译成渲染指令、
 * 窗口操作与持久化请求。它不直接接触窗口、画布与文件系统，
 * 因此可以用桩对象完整测试。
 */

import { anchorToWindowTopLeft, windowTopLeftToAnchor } from '../core/layout/anchor';
import { clampToWorkArea } from '../core/layout/clamp';
import { PetMachine } from '../core/state/machine';
import type { PetSnapshot } from '../core/state/machine';
import type { AppConfig } from '../core/config/schema';
import type { Point, Rect, Skin, SkinIssueCode } from '../core/skin/types';
import type { Autostart } from '../platform/autostart';

export interface RenderFrame {
  animationName: string;
  frameFile: string;
  anchorPosition: Point;
  canvas: { width: number; height: number };
}

export interface Renderer {
  /** 准备皮肤：设置画布尺寸并预载全部帧，返回后可以立即绘制。 */
  prepareSkin(skin: Skin, baseUrl: string): Promise<void> | void;
  /** 设备像素比变化时重设画布后备存储；不关心像素比的实现可以省略。 */
  setScale?(scale: number): void;
  draw(frame: RenderFrame): void;
}

export interface WindowBackend {
  setTopLeft(point: Point): Promise<void> | void;
  /** 把窗口调整成皮肤的画布尺寸，单位是逻辑像素。 */
  setSize(width: number, height: number): Promise<void> | void;
  setAlwaysOnTop(value: boolean): Promise<void> | void;
  quit(): Promise<void> | void;
}

export interface Storage {
  load(): Promise<AppConfig> | AppConfig;
  save(config: AppConfig): Promise<void> | void;
}

export interface SkinSummary {
  id: string;
  displayName: string;
}

export type SkinLoadOutcome =
  | { ok: true; skin: Skin; baseUrl: string }
  | { ok: false; code: SkinIssueCode; reason: string };

export interface SkinRepository {
  list(): Promise<SkinSummary[]>;
  load(id: string): Promise<SkinLoadOutcome>;
}

export interface ControllerDeps {
  renderer: Renderer;
  window: WindowBackend;
  storage: Storage;
  skins: SkinRepository;
  /** 读写系统的开机自启项。 */
  autostart: Autostart;
  /** 返回当前全部显示器的工作区，单位为逻辑像素。 */
  workAreas: () => Promise<Rect[]> | Rect[];
  /** 配置中的皮肤加载失败时使用的备用皮肤标识。 */
  fallbackSkinId?: string;
}

export class PetController {
  private readonly deps: ControllerDeps;
  private readonly fallbackSkinId: string;
  private config: AppConfig | null = null;
  private skin: Skin | null = null;
  private machine: PetMachine | null = null;
  private workAreas: Rect[] = [];

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.fallbackSkinId = deps.fallbackSkinId ?? 'default';
  }

  /** 读取配置、加载皮肤、恢复窗口位置与置顶状态，并绘制第一帧。 */
  async start(): Promise<void> {
    this.config = await this.deps.storage.load();
    this.workAreas = await this.deps.workAreas();
    const outcome = await this.resolveSkin(this.config.activeSkinId);
    if (outcome === null) {
      throw new Error('没有可用的皮肤，程序无法启动');
    }
    if (outcome.id !== this.config.activeSkinId) {
      this.config.activeSkinId = outcome.id;
      await this.save();
    }
    await this.installSkin(outcome.skin, outcome.baseUrl);
    await this.deps.window.setAlwaysOnTop(this.config.alwaysOnTop);
    await this.deps.window.setTopLeft(
      anchorToWindowTopLeft(this.config.anchorPosition, outcome.skin.anchor),
    );
    await this.syncAutostart();
    this.draw();
  }

  /**
   * 处理鼠标按下。返回真表示应当开始系统级拖动，
   * 也就是让操作系统接管窗口移动；返回假表示指针不在宠物命中区域内。
   */
  pointerDown(point: Point): boolean {
    const machine = this.requireMachine();
    const snapshot = machine.dispatch({ type: 'pointerDown', point });
    this.draw();
    return snapshot.state === 'dragging';
  }

  /** 处理指针移动，用于未启用系统级拖动时的兜底路径。 */
  pointerMove(point: Point): void {
    this.requireMachine().dispatch({ type: 'pointerMove', point });
    this.draw();
  }

  /**
   * 结束拖动：处于拖拽状态时切回待机动画，然后把当前锚点写回窗口与配置。
   * 系统拖拽期间网页可能收不到 pointerup，因此这条路径也会被“位置静止”的兜底定时器调用，
   * 此时状态已经是待机，只补写一次位置。
   */
  async pointerUp(): Promise<void> {
    if (this.isDragging()) {
      this.requireMachine().dispatch({ type: 'pointerUp', point: this.anchorPosition() });
      this.draw();
    }
    await this.persistPosition();
  }

  /**
   * 处理操作系统给出的窗口移动。只把窗口左上角换算成锚点并重绘，
   * 不移动窗口也不写磁盘：系统拖拽期间由它自己的模态循环负责搬窗口，
   * 这里再调用一次设置位置会与它互相拉扯，表现为窗口在两个位置之间闪烁。
   */
  handleWindowMoved(topLeft: Point): void {
    const skin = this.skin;
    const machine = this.machine;
    if (skin === null || machine === null) {
      return;
    }
    machine.place(windowTopLeftToAnchor(topLeft, skin.anchor));
    this.draw();
  }

  /** 是否处于拖拽状态，供拖拽结束的兜底判断使用。 */
  isDragging(): boolean {
    return this.machine?.snapshot.state === 'dragging';
  }

  /** 推进虚拟时间，驱动当前动画。 */
  tick(deltaMs: number): void {
    this.requireMachine().dispatch({ type: 'tick', deltaMs });
    this.draw();
  }

  /**
   * 设备像素比变化后的重新对齐。逻辑尺寸不变而物理尺寸变化，
   * 因此用新比例把窗口左上角换算回锚点，再刷新窗口尺寸与画布后备存储。
   */
  async handleScaleChanged(scale: number, topLeft: Point): Promise<void> {
    const skin = this.requireSkin();
    this.deps.renderer.setScale?.(scale);
    this.requireMachine().place(windowTopLeftToAnchor(topLeft, skin.anchor));
    await this.deps.window.setSize(skin.canvas.width, skin.canvas.height);
    this.draw();
    await this.persistPosition();
  }

  /** 翻转置顶状态并写入配置。 */
  async toggleAlwaysOnTop(): Promise<boolean> {
    const config = this.requireConfig();
    config.alwaysOnTop = !config.alwaysOnTop;
    await this.deps.window.setAlwaysOnTop(config.alwaysOnTop);
    await this.save();
    return config.alwaysOnTop;
  }

  /** 翻转开机自启状态，把系统自启项与配置一起改成新状态。 */
  async toggleAutoStart(): Promise<boolean> {
    const config = this.requireConfig();
    config.autoStart = !config.autoStart;
    await this.deps.autostart.setEnabled(config.autoStart);
    await this.save();
    return config.autoStart;
  }

  /**
   * 显示器布局变化后重新夹紧锚点。位置确实变化时把窗口挪回去并写入配置，
   * 位置没有变化则不产生任何写入。
   */
  async applyWorkAreas(workAreas: Rect[]): Promise<void> {
    this.workAreas = workAreas;
    const before = this.anchorPosition();
    this.requireMachine().reclamp();
    this.draw();
    const after = this.anchorPosition();
    if (before.x === after.x && before.y === after.y) {
      return;
    }
    await this.persistPosition();
  }

  /** 切换皮肤。切换失败时保持当前皮肤不变。 */
  async switchSkin(id: string): Promise<boolean> {
    const outcome = await this.resolveSkin(id);
    if (outcome === null) {
      return false;
    }
    if (outcome.id !== id) {
      return false;
    }
    await this.installSkin(outcome.skin, outcome.baseUrl);
    // 新皮肤的锚点与画布尺寸可能不同，按新锚点重新对齐窗口左上角
    await this.deps.window.setTopLeft(
      anchorToWindowTopLeft(this.requireConfig().anchorPosition, outcome.skin.anchor),
    );
    this.requireConfig().activeSkinId = id;
    await this.save();
    this.draw();
    return true;
  }

  /** 返回可切换的皮肤列表。 */
  async listSkins(): Promise<SkinSummary[]> {
    return this.deps.skins.list();
  }

  /** 保存配置后退出程序。 */
  async quit(): Promise<void> {
    await this.save();
    await this.deps.window.quit();
  }

  /** 当前锚点位置，供外部读取，主要服务于测试与调试。 */
  anchorPosition(): Point {
    const snapshot = this.requireMachine().snapshot;
    return snapshot.anchorPosition;
  }

  /** 配置中的开机自启设置，供菜单文字使用。 */
  autoStartEnabled(): boolean {
    return this.requireConfig().autoStart;
  }

  /** 当前快照，供外部读取。 */
  snapshot(): PetSnapshot {
    return this.requireMachine().snapshot;
  }

  private async resolveSkin(id: string): Promise<{ id: string; skin: Skin; baseUrl: string } | null> {
    const primary = await this.deps.skins.load(id);
    if (primary.ok) {
      return { id, skin: primary.skin, baseUrl: primary.baseUrl };
    }
    if (id === this.fallbackSkinId) {
      return null;
    }
    const fallback = await this.deps.skins.load(this.fallbackSkinId);
    if (fallback.ok) {
      return { id: this.fallbackSkinId, skin: fallback.skin, baseUrl: fallback.baseUrl };
    }
    return null;
  }

  private async installSkin(skin: Skin, baseUrl: string): Promise<void> {
    this.skin = skin;
    const anchorPosition = this.config?.anchorPosition ?? { x: 0, y: 0 };
    this.machine = new PetMachine({
      skin,
      anchorPosition,
      clampPosition: (point) => clampToWorkArea(point, this.workAreas),
    });
    await this.deps.renderer.prepareSkin(skin, baseUrl);
    await this.deps.window.setSize(skin.canvas.width, skin.canvas.height);
  }

  /** 让系统的自启项与配置保持一致，两者相同时不重复写系统。 */
  private async syncAutostart(): Promise<void> {
    const config = this.requireConfig();
    const enabled = await this.deps.autostart.isEnabled();
    if (enabled !== config.autoStart) {
      await this.deps.autostart.setEnabled(config.autoStart);
    }
  }

  private draw(): void {
    const machine = this.machine;
    const skin = this.skin;
    if (machine === null || skin === null) {
      return;
    }
    const snapshot = machine.snapshot;
    this.deps.renderer.draw({
      animationName: snapshot.animationName,
      frameFile: snapshot.frame.file,
      anchorPosition: snapshot.anchorPosition,
      canvas: { ...skin.canvas },
    });
  }

  private async persistPosition(): Promise<void> {
    const config = this.requireConfig();
    const skin = this.requireSkin();
    config.anchorPosition = this.anchorPosition();
    await this.deps.window.setTopLeft(anchorToWindowTopLeft(config.anchorPosition, skin.anchor));
    await this.save();
  }

  private async save(): Promise<void> {
    const config = this.requireConfig();
    await this.deps.storage.save({
      activeSkinId: config.activeSkinId,
      alwaysOnTop: config.alwaysOnTop,
      autoStart: config.autoStart,
      anchorPosition: { ...config.anchorPosition },
    });
  }

  private requireConfig(): AppConfig {
    if (this.config === null) {
      throw new Error('控制器尚未启动，请先调用 start');
    }
    return this.config;
  }

  private requireSkin(): Skin {
    if (this.skin === null) {
      throw new Error('控制器尚未加载任何皮肤');
    }
    return this.skin;
  }

  private requireMachine(): PetMachine {
    if (this.machine === null) {
      throw new Error('控制器尚未启动，请先调用 start');
    }
    return this.machine;
  }
}
