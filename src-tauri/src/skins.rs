//! 用户皮肤目录与 `skin://` 自定义协议。
//!
//! 随程序分发的皮肤是只读的，热加载必须有一个可写目录：
//! 应用数据目录下的 `skins` 子目录。该目录按皮肤标识分子目录，
//! 结构与应用内皮肤包完全一致；同名的用户皮肤优先于内置皮肤。
//!
//! 网页通过 `skin://` 协议读取该目录，协议处理器会拒绝包含父级跳转的路径，
//! 并确认最终路径仍位于用户目录之内。

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::Manager;

/// 用户皮肤目录，不存在时创建。
pub fn user_skin_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("skins");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

/// 列出用户目录下的皮肤标识，即各个子目录的名称。
#[tauri::command]
pub fn user_skin_ids(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = user_skin_dir(&app)?;
    let mut ids = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                ids.push(name.to_string());
            }
        }
    }
    ids.sort();
    Ok(ids)
}

/// 用户目录的内容指纹：每个皮肤的最近修改时间与总字节数。
/// 前端轮询该指纹，变化时重新加载当前皮肤，避免定时重读全部文件。
#[tauri::command]
pub fn skins_signature(app: tauri::AppHandle) -> Result<String, String> {
    let dir = user_skin_dir(&app)?;
    let mut parts = Vec::new();
    for id in user_skin_ids(app.clone())? {
        let mut newest = 0u64;
        let mut total = 0u64;
        accumulate(&dir.join(&id), &mut newest, &mut total);
        parts.push(format!("{id}:{newest}:{total}"));
    }
    Ok(parts.join("|"))
}

fn accumulate(dir: &Path, newest: &mut u64, total: &mut u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            accumulate(&entry.path(), newest, total);
            continue;
        }
        *total += meta.len();
        if let Ok(modified) = meta.modified() {
            if let Ok(since_epoch) = modified.duration_since(UNIX_EPOCH) {
                *newest = (*newest).max(since_epoch.as_millis() as u64);
            }
        }
    }
}

/// 处理 `skin://` 请求。相对路径形如 `default/images/idle_0.png`。
/// 请求行里的路径是百分号编码的（中文皮肤目录会变成 `%E4%BA%9A%E8%B4%9E`），
/// 必须先解码再交给文件系统，否则非 ASCII 目录名一律读不到。
pub fn handle_protocol(app: &tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let relative = percent_decode(request.uri().path().trim_start_matches('/'));
    match read_user_file(app, &relative) {
        Some((bytes, content_type)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            // 热加载依赖每次读取最新文件，禁止网页缓存
            .header(header::CACHE_CONTROL, "no-store")
            .body(bytes)
            .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR, "响应构建失败")),
        None => status(StatusCode::NOT_FOUND, "用户皮肤目录中不存在该文件"),
    }
}

fn status(code: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_default()
}

fn read_user_file(app: &tauri::AppHandle, relative: &str) -> Option<(Vec<u8>, &'static str)> {
    if relative.is_empty() {
        return None;
    }
    let relative_path = Path::new(relative);
    if !relative_path
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return None;
    }
    let root = user_skin_dir(app).ok()?;
    let canonical_root = fs::canonicalize(&root).ok()?;
    let canonical = fs::canonicalize(root.join(relative_path)).ok()?;
    if !canonical.starts_with(&canonical_root) || !canonical.is_file() {
        return None;
    }
    let bytes = fs::read(&canonical).ok()?;
    Some((bytes, content_type_of(&canonical)))
}

/// 解码百分号编码的路径。非法或截断的转义原样保留，交给后续的路径校验去拒绝。
fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                out.push((high * 16 + low) as u8);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn content_type_of(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match extension.as_deref() {
        Some("png") => "image/png",
        Some("json") => "application/json; charset=utf-8",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn ascii_path_passes_through() {
        assert_eq!(percent_decode("default/images/idle_0.png"), "default/images/idle_0.png");
    }

    #[test]
    fn chinese_directory_is_decoded() {
        assert_eq!(
            percent_decode("%E4%BA%9A%E8%B4%9E/images/idle_0.png"),
            "亚贞/images/idle_0.png"
        );
    }

    #[test]
    fn spaces_and_plus_are_handled() {
        // 路径里不会出现表单编码的加号，加号按字面保留
        assert_eq!(percent_decode("a%20b+c.png"), "a b+c.png");
    }

    #[test]
    fn malformed_escape_is_kept_verbatim() {
        assert_eq!(percent_decode("%ZZ/%2"), "%ZZ/%2");
        assert_eq!(percent_decode("tail%"), "tail%");
    }

    #[test]
    fn encoded_separators_are_decoded_before_validation() {
        // 解码后会出现 .. 与分隔符，由调用方的逐段校验拒绝，这里只确认解码结果
        assert_eq!(percent_decode("..%2F..%2Fsecret"), "../../secret");
    }
}
