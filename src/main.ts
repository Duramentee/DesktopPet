/**
 * 渲染进程入口。
 * 本文件只负责装配五个组件并把浏览器事件转发给控制器，
 * 不包含任何业务规则。
 */

import { PetController } from './app/controller';
import { IdleMotion } from './core/animation/idle-motion';
import { CanvasRenderer } from './renderer/canvas-renderer';
import { createTauriWindowBackend } from './platform/window';
import { createTauriStorage } from './platform/storage';
import { createFetchSkinRepository, openSkinManager, watchSkinChanges } from './platform/skins';
import { listWorkAreas } from './platform/screen';
import { watchWorkAreas } from './platform/monitors';
import { readCursorPosition, watchPointerRegion } from './platform/pointer-region';
import { createTauriAutostart } from './platform/autostart';
import { popupContextMenu } from './platform/menu';
import { degradedCapabilities, detectRuntime, readRuntimeInfo } from './platform/runtime';
import { physicalToLogical, resolveScale } from './renderer/dpi';
import { FpsMeter } from './renderer/fps';
import type { FpsReport } from './renderer/fps';
import { createTauriLogger, installErrorReporting, openLogFolder } from './platform/logger';
import type { Logger } from './platform/logger';
import { formatMegabytes, readMemoryUsage, setTrayTooltip } from './platform/diagnostics';

/** 帧率统计窗口，每满一个窗口把结果写进托盘提示，偏低时落日志。 */
const HEALTH_WINDOW_MS = 30_000;
/** 正常状态下每十分钟留一条心跳日志，便于确认程序仍在运行。 */
const HEARTBEAT_MS = 10 * 60_000;
/** 低于该帧率视为异常，落一条警告。 */
const LOW_FPS = 45;

async function bootstrap(): Promise<void> {
  const logger = await createTauriLogger();
  installErrorReporting(logger);
  await startPet(logger);
}

async function startPet(logger: Logger): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#pet');
  if (canvas === null) {
    throw new Error('页面中缺少画布元素，程序无法启动');
  }

  const windowBackend = await createTauriWindowBackend();
  const controller = new PetController({
    renderer: new CanvasRenderer(canvas),
    window: windowBackend,
    storage: await createTauriStorage(),
    skins: await createFetchSkinRepository(),
    autostart: await createTauriAutostart(),
    idleMotion: new IdleMotion(),
    workAreas: listWorkAreas,
    fallbackSkinId: 'default',
  });

  await controller.start();

  // 显示器热插拔没有对应事件，改为轮询布局指纹，变化时把宠物夹回可见区域
  watchWorkAreas((areas) => controller.applyWorkAreas(areas), { list: listWorkAreas });

  // 透明像素不拦截鼠标：光标落在宠物轮廓之外时让窗口穿透，落在身上时恢复交互
  watchPointerRegion({
    cursor: readCursorPosition,
    isOnPet: (point) => controller.isPointOnPet(point),
    isSuspended: () => controller.isDragging(),
    onChange: (interactive) => windowBackend.setIgnoreCursorEvents(!interactive),
    onError: (error) => {
      logger.warn(`读取光标位置失败，暂停穿透判断：${String(error)}`);
    },
  });

  // 皮肤管理窗口通过事件请求切换皮肤，成功后把当前皮肤广播回去用于高亮
  const { emit: emitEvent, listen: listenEvent } = await import('@tauri-apps/api/event');
  await listenEvent<{ id: string }>('pet:switch-skin', async ({ payload }) => {
    const id = payload?.id;
    if (typeof id !== 'string') {
      return;
    }
    const switched = await controller.switchSkin(id);
    if (switched) {
      logger.info(`切换皮肤：${id}`);
      await emitEvent('pet:skin-changed', { id });
    } else {
      logger.warn(`切换到皮肤 ${id} 失败`);
    }
  });

  // 用户皮肤目录被修改后自动重新加载当前皮肤，并把变化广播给皮肤管理窗口
  watchSkinChanges(async () => {
    const reloaded = await controller.reloadActiveSkin();
    if (reloaded) {
      logger.info('检测到皮肤目录变化，已重新加载当前皮肤');
    } else {
      logger.warn('检测到皮肤目录变化，但当前皮肤无法重新加载');
    }
    await emitEvent('pet:skins-changed', { reloaded });
  });

  // 识别运行环境并输出已知的能力降级项，使降级表现有明确的原因可循
  const runtimeKind = detectRuntime(await readRuntimeInfo());
  for (const warning of degradedCapabilities(runtimeKind)) {
    console.warn(`[runtime] ${warning.capability}受限：${warning.reason}`);
  }
  logger.info(
    `启动完成：环境 ${runtimeKind}，缩放 ${resolveScale(window.devicePixelRatio)}，画布 ${canvas.width}x${canvas.height}`,
  );

  let previous = performance.now();
  const fpsMeter = new FpsMeter(HEALTH_WINDOW_MS);
  let lastHeartbeat = previous;
  let firstReport = true;

  const publishHealth = async (report: FpsReport, now: number): Promise<void> => {
    const memory = await readMemoryUsage();
    const summary = `${report.fps} fps · ${formatMegabytes(memory)}`;
    await setTrayTooltip(`桌面宠物 · ${summary}`);
    if (firstReport) {
      firstReport = false;
      logger.info(`首个统计窗口：${summary}，最长帧 ${report.longestFrameMs} 毫秒`);
      return;
    }
    if (report.fps < LOW_FPS) {
      logger.warn(`帧率偏低：${summary}，最长帧 ${report.longestFrameMs} 毫秒`);
      return;
    }
    if (now - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = now;
      logger.info(`运行正常：${summary}`);
    }
  };

  const frameLoop = (now: number): void => {
    const delta = now - previous;
    previous = now;
    controller.tick(delta);
    const report = fpsMeter.sample(delta);
    if (report !== null) {
      void publishHealth(report, now);
    }
    requestAnimationFrame(frameLoop);
  };
  requestAnimationFrame(frameLoop);

  canvas.addEventListener('pointerdown', (event) => {
    const began = controller.pointerDown({ x: event.screenX, y: event.screenY });
    if (began) {
      // 交给操作系统接管窗口拖动，指针移出窗口范围后拖动仍然继续
      void windowBackend.startDragging();
    }
  });

  canvas.addEventListener('pointerup', () => {
    void controller.pointerUp();
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    void popupContextMenu({
      autoStartEnabled: () => controller.autoStartEnabled(),
      idleMotionEnabled: () => controller.idleMotionEnabled(),
      onToggleAlwaysOnTop: () => controller.toggleAlwaysOnTop(),
      onToggleAutoStart: () => controller.toggleAutoStart(),
      onToggleIdleMotion: () => controller.toggleIdleMotion(),
      onOpenSkinManager: () => openSkinManager(),
      onOpenLogs: () => openLogFolder(),
      onQuit: async () => {
        logger.info('用户请求退出');
        await logger.flush();
        await controller.quit();
      },
    });
  });

  // 操作系统完成窗口拖动之后回读窗口位置，把物理像素按当前缩放比例换算成逻辑像素。
  // 这条路径只更新锚点与画面，窗口位置由系统的拖拽循环负责，避免互相拉扯造成闪烁。
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = getCurrentWindow();
  let dragFinishTimer: ReturnType<typeof setTimeout> | undefined;

  // 系统拖拽期间网页收不到 pointerup，因此用“位置连续静止一段时间”作为兜底结束条件。
  // 每次移动都会重置计时器，静止后补写最终位置；拖拽状态也在这里收尾。
  const scheduleDragFinish = (): void => {
    if (dragFinishTimer !== undefined) {
      clearTimeout(dragFinishTimer);
    }
    dragFinishTimer = setTimeout(() => {
      dragFinishTimer = undefined;
      void controller.pointerUp();
    }, 400);
  };

  await currentWindow.onMoved(({ payload }) => {
    // 每次都重新读取比例：跨缩放比例不同的显示器拖动后，启动时缓存的比例已经不对
    const scale = resolveScale(window.devicePixelRatio);
    controller.handleWindowMoved(physicalToLogical(payload, scale));
    scheduleDragFinish();
  });

  // 缩放比例变化时窗口的逻辑尺寸不变而物理尺寸变化，需要重新对齐窗口并重建画布
  await currentWindow.onScaleChanged(async ({ payload }) => {
    const scale = resolveScale(payload.scaleFactor);
    const physical = await currentWindow.outerPosition();
    await controller.handleScaleChanged(scale, physicalToLogical(physical, scale));
  });
}

void bootstrap().catch((error: unknown) => {
  console.error('[startup] 程序启动失败', error);
});
