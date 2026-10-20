use crate::store;

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
