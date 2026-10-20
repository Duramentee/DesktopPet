mod commands;
mod store;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tray::create(app.handle())?;
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
