//! 日志落盘。
//!
//! 前端与控制台不可见的错误都写进应用日志目录下的 `app.log`，
//! 单个文件超过五百一十二千字节时滚动成 `app.log.1`，避免长期运行把磁盘写满。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use tauri::Manager;

/// 单个日志文件的大小上限，超过之后滚动一次。
const MAX_BYTES: u64 = 512 * 1024;

/// 日志目录，不存在时创建。
pub fn log_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn log_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(log_dir(app)?.join("app.log"))
}

fn rotate_if_needed(path: &PathBuf) {
    match fs::metadata(path) {
        Ok(meta) if meta.len() > MAX_BYTES => {
            let _ = fs::rename(path, path.with_extension("log.1"));
        }
        _ => {}
    }
}

/// 追加一行日志。消息里的换行会被转义，保证一条日志只占一行。
pub fn write(app: &tauri::AppHandle, level: &str, message: &str) -> Result<(), String> {
    let path = log_path(app)?;
    rotate_if_needed(&path);
    let stamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| String::from("unknown-time"));
    let line = format!(
        "{stamp} [{}] {}\n",
        level.to_uppercase(),
        message.replace('\r', "").replace('\n', "\\n")
    );
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes()).map_err(|error| error.to_string())
}
