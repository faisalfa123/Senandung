use axum::{
    extract::Path,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "web/"]
pub struct EmbeddedUiAsset;

pub async fn serve_index_handler(headers: HeaderMap) -> Response {
    serve_embedded_path("index.html", &headers)
}

pub async fn serve_static_asset_handler(
    Path(path): Path<String>,
    headers: HeaderMap,
) -> Response {
    let trimmed = path.trim_start_matches('/');
    let target = if trimmed.is_empty() {
        "index.html"
    } else {
        trimmed
    };
    serve_embedded_path(target, &headers)
}

fn serve_embedded_path(path: &str, req_headers: &HeaderMap) -> Response {
    let Some(asset) = EmbeddedUiAsset::get(path) else {
        return (StatusCode::NOT_FOUND, "Static UI asset not found").into_response();
    };

    let body_bytes = asset.data.into_owned();
    let mime = mime_from_path(path);
    let etag = generate_etag(&body_bytes);

    let cache_header = if path == "index.html" || path == "sw.js" {
        "no-cache, must-revalidate"
    } else {
        "public, max-age=31536000, immutable"
    };

    if let Some(if_none_match) = req_headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    {
        if if_none_match.trim() == etag {
            return Response::builder()
                .status(StatusCode::NOT_MODIFIED)
                .header(header::ETAG, etag)
                .header(header::CACHE_CONTROL, cache_header)
                .body(axum::body::Body::empty())
                .unwrap_or_else(|_| StatusCode::NOT_MODIFIED.into_response());
        }
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, cache_header)
        .header(header::ETAG, etag)
        .body(axum::body::Body::from(body_bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn mime_from_path(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".json") {
        "application/json"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

/// Fast deterministic FNV-1a 64-bit hash formatted as an HTTP strong ETag.
pub fn generate_etag(data: &[u8]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &b in data {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("\"v301-{:016x}-{}\"", hash, data.len())
}
