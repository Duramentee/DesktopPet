use crate::log;
use crate::store;

use tauri::Manager;

/// 运行环境的原始事实，用于前端识别是否处于 WSL 的图形会话中。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub os: String,
    pub wsl_distro: Option<String>,
    pub has_wslg_mount: bool,
}

/// 返回当前运行环境的原始事实。前端根据这些事实判断能力降级情况。
#[tauri::command]
pub fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        os: std::env::consts::OS.to_string(),
        wsl_distro: std::env::var("WSL_DISTRO_NAME").ok(),
        has_wslg_mount: std::path::Path::new("/mnt/wslg").exists(),
    }
}

/// 写入一条日志。前端的警告与错误通过这里落盘，便于事后排查。
#[tauri::command]
pub fn append_log(app: tauri::AppHandle, level: String, message: String) -> Result<(), String> {
    log::write(&app, &level, &message)
}

/// 在系统文件管理器中打开日志目录。
#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = log::log_dir(&app)?;
    open_in_file_manager(&dir)
}

/// 显示皮肤管理窗口并聚焦。窗口由配置预创建为隐藏状态，这里不新建窗口。
#[tauri::command]
pub fn show_skins_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("skins")
        .ok_or_else(|| String::from("皮肤管理窗口不存在"))?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

/// 隐藏皮肤管理窗口，保留窗口实例以便再次打开。
#[tauri::command]
pub fn hide_skins_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("skins")
        .ok_or_else(|| String::from("皮肤管理窗口不存在"))?;
    window.hide().map_err(|error| error.to_string())
}

/// 更新托盘图标的提示文字，鼠标悬停时可见。
#[tauri::command]
pub fn set_tray_tooltip(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let tray = app
        .tray_by_id("pet-tray")
        .ok_or_else(|| String::from("托盘图标尚未创建"))?;
    tray.set_tooltip(Some(text))
        .map_err(|error| error.to_string())
}

/// 当前进程的常驻内存字节数。平台不支持时返回 None。
#[tauri::command]
pub fn memory_usage() -> Option<u64> {
    working_set_bytes()
}

#[cfg(windows)]
fn working_set_bytes() -> Option<u64> {
    use windows_sys::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let ok = GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb);
        if ok == 0 {
            None
        } else {
            Some(counters.WorkingSetSize as u64)
        }
    }
}

#[cfg(not(windows))]
fn working_set_bytes() -> Option<u64> {
    None
}

#[cfg(windows)]
fn open_in_file_manager(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn open_in_file_manager(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_file_manager(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// 读取配置文件内容。文件不存在时返回 None，前端据此使用缺省值。
#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    store::read_config(&app)
}

/// 写入配置文件内容。前端负责序列化，Rust 侧只做原样落盘。
#[tauri::command]
pub fn save_config(app: tauri::AppHandle, text: String) -> Result<(), String> {
    store::write_config(&app, &text)
}
