/**
 * 平台适配层：右键菜单与系统托盘。
 *
 * 宠物窗口的尺寸等于皮肤画布尺寸，网页内部的菜单会被窗口边界裁切，
 * 因此右键菜单使用操作系统的原生菜单，由系统负责在窗口之外绘制。
 */

import type { SkinSummary } from '../app/controller';

export interface ContextMenuHandlers {
  listSkins: () => Promise<SkinSummary[]>;
  onToggleAlwaysOnTop: () => Promise<unknown> | void;
  onSwitchSkin: (id: string) => Promise<unknown> | void;
  onQuit: () => Promise<unknown> | void;
}

interface NativeMenuItem {
  id: string;
  text: string;
  action: () => void;
}

/** 在光标位置弹出原生右键菜单。 */
export async function popupContextMenu(handlers: ContextMenuHandlers): Promise<void> {
  const { Menu } = await import('@tauri-apps/api/menu');
  const skins = await handlers.listSkins();
  const items: NativeMenuItem[] = [
    {
      id: 'toggle-always-on-top',
      text: '切换置顶',
      action: () => {
        void handlers.onToggleAlwaysOnTop();
      },
    },
    ...skins.map((skin) => ({
      id: `skin:${skin.id}`,
      text: `皮肤：${skin.displayName}`,
      action: () => {
        void handlers.onSwitchSkin(skin.id);
      },
    })),
    {
      id: 'quit',
      text: '退出',
      action: () => {
        void handlers.onQuit();
      },
    },
  ];
  const menu = await Menu.new({ items });
  await menu.popup();
}
