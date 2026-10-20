/**
 * 渲染进程入口。
 * 本文件只负责装配五个组件并把浏览器事件转发给控制器，
 * 不包含任何业务规则。
 */

import { PetController } from './app/controller';
import { CanvasRenderer } from './renderer/canvas-renderer';
import { createTauriWindowBackend } from './platform/window';
import { createTauriStorage } from './platform/storage';
import { createFetchSkinRepository } from './platform/skins';
import { listWorkAreas } from './platform/screen';
import { watchWorkAreas } from './platform/monitors';
import { createTauriAutostart } from './platform/autostart';
import { popupContextMenu } from './platform/menu';
import { degradedCapabilities, detectRuntime, readRuntimeInfo } from './platform/runtime';
import { physicalToLogical, resolveScale } from './renderer/dpi';

async function bootstrap(): Promise<void> {
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
    workAreas: listWorkAreas,
    fallbackSkinId: 'default',
  });

  await controller.start();

  // 显示器热插拔没有对应事件，改为轮询布局指纹，变化时把宠物夹回可见区域
  watchWorkAreas((areas) => controller.applyWorkAreas(areas), { list: listWorkAreas });

  // 识别运行环境并输出已知的能力降级项，使降级表现有明确的原因可循
  const runtimeKind = detectRuntime(await readRuntimeInfo());
  for (const warning of degradedCapabilities(runtimeKind)) {
    console.warn(`[runtime] ${warning.capability}受限：${warning.reason}`);
  }

  let previous = performance.now();
  const frameLoop = (now: number): void => {
    controller.tick(now - previous);
    previous = now;
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
      listSkins: () => controller.listSkins(),
      autoStartEnabled: () => controller.autoStartEnabled(),
      onToggleAlwaysOnTop: () => controller.toggleAlwaysOnTop(),
      onToggleAutoStart: () => controller.toggleAutoStart(),
      onSwitchSkin: (id) => controller.switchSkin(id),
      onQuit: () => controller.quit(),
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
