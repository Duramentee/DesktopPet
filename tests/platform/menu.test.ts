import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ created: [] as { items: MenuItemLike[] }[] }));

interface MenuItemLike {
  id: string;
  text: string;
  enabled?: boolean;
  action?: () => void;
}

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: async (options: { items: MenuItemLike[] }) => {
      state.created.push(options);
      return { popup: async () => undefined };
    },
  },
}));

const { popupContextMenu } = await import('../../src/platform/menu');

function handlersOf(overrides: Record<string, unknown> = {}) {
  return {
    autoStartEnabled: () => true,
    idleMotionEnabled: () => false,
    currentScale: () => 1.25,
    onToggleAlwaysOnTop: vi.fn(),
    onToggleAutoStart: vi.fn(),
    onToggleIdleMotion: vi.fn(),
    onScaleUp: vi.fn(),
    onScaleDown: vi.fn(),
    onOpenSkinManager: vi.fn(),
    onOpenLogs: vi.fn(),
    onQuit: vi.fn(),
    ...overrides,
  };
}

async function openMenu(overrides: Record<string, unknown> = {}) {
  state.created.length = 0;
  const handlers = handlersOf(overrides);
  await popupContextMenu(handlers);
  const items = state.created.at(-1)?.items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  return { items, byId, handlers };
}

describe('右键菜单', () => {
  it('按固定顺序列出各项，档位标签夹在大小操作之前', async () => {
    const { items } = await openMenu();
    expect(items.map((item) => item.id)).toEqual([
      'toggle-always-on-top',
      'toggle-auto-start',
      'toggle-idle-motion',
      'scale-label',
      'scale-up',
      'scale-down',
      'open-skins',
      'open-logs',
      'quit',
    ]);
  });

  it('文字反映当前状态与当前倍率', async () => {
    const { byId } = await openMenu();
    expect(byId.get('toggle-auto-start')?.text).toBe('开机自启：开');
    expect(byId.get('toggle-idle-motion')?.text).toBe('待机小动作：关');
    expect(byId.get('scale-label')?.text).toBe('宠物大小：125%');
    // 档位标签只做展示，不能被点
    expect(byId.get('scale-label')?.enabled).toBe(false);
  });

  it('点击放大与缩小分别触发对应动作', async () => {
    const { byId, handlers } = await openMenu();
    byId.get('scale-up')?.action?.();
    byId.get('scale-down')?.action?.();
    expect(handlers.onScaleUp).toHaveBeenCalledTimes(1);
    expect(handlers.onScaleDown).toHaveBeenCalledTimes(1);
  });

  it('其余各项分别转发到对应回调', async () => {
    const { byId, handlers } = await openMenu();
    byId.get('toggle-always-on-top')?.action?.();
    byId.get('toggle-auto-start')?.action?.();
    byId.get('toggle-idle-motion')?.action?.();
    byId.get('open-skins')?.action?.();
    byId.get('open-logs')?.action?.();
    byId.get('quit')?.action?.();
    expect(handlers.onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleAutoStart).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleIdleMotion).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenSkinManager).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenLogs).toHaveBeenCalledTimes(1);
    expect(handlers.onQuit).toHaveBeenCalledTimes(1);
  });
});
