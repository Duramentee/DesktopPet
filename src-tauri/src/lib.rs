mod commands;
mod store;
mod tray;
mod window_style;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            tray::create(app.handle())?;
            if let Some(window) = app.get_webview_window("pet") {
                window_style::prepare_pet_window(&window)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::runtime_info
        ])
        .run(tauri::generate_context!())
        .expect("启动桌面宠物失败");
}
