// MotionFrame para desktop com Tauri (WebView2 do Windows): um .exe pequeno, sem embutir um navegador inteiro como o
// Electron. O editor (pasta www/) vai DENTRO do .exe e é servido num endereço local fixo, o mesmo do app Electron
// (http://127.0.0.1:47830), então tudo funciona igual: WebGL, WebCodecs, Workers, exportação.
// Atualização automática: como no Electron, baixa o app-update.zip do site para <dados do usuário>/MotionFrame/www-live
// e esses arquivos passam a ter prioridade sobre os de dentro do .exe.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use include_dir::{include_dir, Dir};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static WWW: Dir = include_dir!("$CARGO_MANIFEST_DIR/www");
const PORT: u16 = 47830;
const REMOTE: &str = "https://ofd1.github.io/Teste-AF-HUB/";

fn data_dir() -> PathBuf {
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("MotionFrame")
}
fn live_dir() -> PathBuf {
    data_dir().join("www-live")
}

/// Número interno da versão (APP_VERSION = 'v123' → 123) a partir do conteúdo de js/projects.js.
fn ver_of(text: &str) -> u32 {
    text.find("APP_VERSION = 'v")
        .and_then(|i| {
            let rest = &text[i + 16..];
            let end = rest.find('\'')?;
            rest[..end].parse().ok()
        })
        .unwrap_or(0)
}
fn embedded_ver() -> u32 {
    WWW.get_file("js/projects.js").and_then(|f| f.contents_utf8()).map(ver_of).unwrap_or(0)
}
fn live_ver() -> u32 {
    fs::read_to_string(live_dir().join("js/projects.js")).map(|t| ver_of(&t)).unwrap_or(0)
}

fn mime(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "webmanifest" => "application/manifest+json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "wasm" => "application/wasm",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "cube" => "text/plain",
        _ => "application/octet-stream",
    }
}

/// Servidor local: arquivo da atualização baixada (se mais nova) ou o de dentro do .exe.
fn serve(use_live: Arc<AtomicBool>) {
    let server = match tiny_http::Server::http(("127.0.0.1", PORT)) {
        Ok(s) => s,
        Err(e) => {
            rfd::MessageDialog::new()
                .set_title("MotionFrame")
                .set_description(format!("Não consegui iniciar o editor (porta {PORT} ocupada? Feche o outro MotionFrame).\n{e}"))
                .show();
            std::process::exit(1);
        }
    };
    for req in server.incoming_requests() {
        let raw = req.url().split('?').next().unwrap_or("/").to_string();
        let mut path = percent_decode(raw.trim_start_matches('/'));
        if path.is_empty() || path.ends_with('/') {
            path.push_str("index.html");
        }
        if path.contains("..") {
            let _ = req.respond(tiny_http::Response::empty(403));
            continue;
        }
        let mut body: Option<Vec<u8>> = None;
        if use_live.load(Ordering::Relaxed) {
            if let Ok(b) = fs::read(live_dir().join(&path)) {
                body = Some(b);
            }
        }
        if body.is_none() {
            body = WWW.get_file(&path).map(|f| f.contents().to_vec());
        }
        match body {
            Some(b) => {
                let resp = tiny_http::Response::from_data(b)
                    .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], mime(&path).as_bytes()).unwrap())
                    .with_header(tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap());
                let _ = req.respond(resp);
            }
            None => {
                let _ = req.respond(tiny_http::Response::empty(404));
            }
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn unzip_to(buf: &[u8], dir: &Path) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(Cursor::new(buf)).map_err(|e| e.to_string())?;
    for i in 0..z.len() {
        let mut f = z.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        if name.ends_with('/') || name.contains("..") {
            continue;
        }
        let out = dir.join(&name);
        if let Some(p) = out.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut data = Vec::new();
        f.read_to_end(&mut data).map_err(|e| e.to_string())?;
        fs::write(&out, data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Procura versão nova no site; se houver, baixa, confere e pergunta se recarrega agora.
fn check_update(app: &tauri::AppHandle, use_live: &Arc<AtomicBool>) -> Result<(), String> {
    let info: String = ureq::get(&format!("{REMOTE}version.json")).call().map_err(|e| e.to_string())?.into_string().map_err(|e| e.to_string())?;
    let field = |k: &str| -> Option<String> {
        let i = info.find(&format!("\"{k}\""))?;
        let rest = &info[i..];
        let a = rest[k.len() + 2..].find('"')? + k.len() + 3;
        let b = rest[a..].find('"')? + a;
        Some(rest[a..b].to_string())
    };
    let remote = field("version").map(|v| ver_of(&format!("APP_VERSION = '{v}'"))).unwrap_or(0);
    let cur = live_ver().max(embedded_ver());
    if remote <= cur {
        return Ok(());
    }
    let update = field("update").unwrap_or_else(|| "app-update.zip".into());
    let mut buf = Vec::new();
    ureq::get(&format!("{REMOTE}{update}?v={remote}")).call().map_err(|e| e.to_string())?.into_reader().read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let next = data_dir().join("www-live-next");
    let _ = fs::remove_dir_all(&next);
    fs::create_dir_all(&next).map_err(|e| e.to_string())?;
    unzip_to(&buf, &next)?;
    let got = fs::read_to_string(next.join("js/projects.js")).map(|t| ver_of(&t)).unwrap_or(0);
    if got != remote {
        return Err("pacote incompleto".into());
    }
    let _ = fs::remove_dir_all(live_dir());
    fs::rename(&next, live_dir()).map_err(|e| e.to_string())?;
    use_live.store(true, Ordering::Relaxed);
    let label = field("label").unwrap_or_else(|| format!("v{remote}"));
    let yes = rfd::MessageDialog::new()
        .set_title("MotionFrame")
        .set_description(format!("MotionFrame {label} baixado.\nO editor recarrega com a versão nova (seu projeto já está salvo)."))
        .set_buttons(rfd::MessageButtons::OkCancelCustom("Atualizar agora".into(), "Depois".into()))
        .show();
    if matches!(yes, rfd::MessageDialogResult::Custom(ref s) if s == "Atualizar agora") || matches!(yes, rfd::MessageDialogResult::Ok) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.eval("location.reload()");
        }
    }
    Ok(())
}

fn main() {
    let _ = fs::create_dir_all(data_dir());
    let use_live = Arc::new(AtomicBool::new(live_ver() > embedded_ver()));
    {
        let ul = use_live.clone();
        std::thread::spawn(move || serve(ul));
    }
    let ul = use_live.clone();
    tauri::Builder::default()
        .setup(move |app| {
            let url: tauri::Url = format!("http://127.0.0.1:{PORT}/index.html").parse().unwrap();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("MotionFrame")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .maximized(true)
                .build()?;
            let handle = app.handle().clone();
            let ul2 = ul.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                loop {
                    let _ = check_update(&handle, &ul2);
                    std::thread::sleep(std::time::Duration::from_secs(3600));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o MotionFrame");
}
