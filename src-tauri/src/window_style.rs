//! 无边框窗口样式修正。
//!
//! Windows 会按最小跟踪宽度（96 度 DPI 下为 136 像素）撑开带有标题栏样式的窗口，
//! 64 像素见方的宠物因此被横向拉伸。宠物窗口不需要标题栏、系统菜单与最小化按钮，
//! 去掉这些样式后系统才会认可皮肤给定的实际尺寸。

#[cfg(windows)]
pub fn prepare_pet_window(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOSIZE, WS_CAPTION, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_SYSMENU,
    };

    let hwnd = window.hwnd()?.0;
    let stripped = (WS_CAPTION | WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_SYSMENU) as isize;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !stripped);
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn prepare_pet_window(_window: &tauri::WebviewWindow) -> tauri::Result<()> {
    Ok(())
}
