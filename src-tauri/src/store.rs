use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::Manager;

/// 配置文件路径：操作系统提供的应用配置目录下的 config.json。
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("config.json"))
}

/// 读取配置文本。文件不存在属于正常情况，返回 None 而不是错误。
pub fn read_config(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = config_path(app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// 写入配置文本。先写临时文件再改名，避免写入过程中断导致文件损坏。
pub fn write_config(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let path = config_path(app)?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, text).map_err(|error| error.to_string())?;
    fs::rename(&temp, &path).map_err(|error| error.to_string())
}
