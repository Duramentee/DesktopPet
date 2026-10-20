mod commands;
mod log;
mod skins;
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
        // 用户皮肤目录通过自定义协议读取，支持运行中新增与修改皮肤包
        .register_uri_scheme_protocol("skin", |context, request| {
            skins::handle_protocol(context.app_handle(), request)
        })
        .setup(|app| {
            // 图形程序没有控制台，panic 信息必须落盘，否则崩溃之后没有任何线索
            let handle = app.handle().clone();
            std::panic::set_hook(Box::new(move |info| {
                let _ = log::write(&handle, "panic", &info.to_string());
            }));

            tray::create(app.handle())?;
            if let Some(window) = app.get_webview_window("pet") {
                window_style::prepare_pet_window(&window)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::runtime_info,
            commands::append_log,
            commands::open_log_dir,
            commands::memory_usage,
            commands::set_tray_tooltip,
            commands::show_skins_window,
            commands::hide_skins_window,
            skins::user_skin_ids,
            skins::skins_signature
        ])
        .run(tauri::generate_context!())
        .expect("启动桌面宠物失败");
}
