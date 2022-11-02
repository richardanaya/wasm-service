use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};

static mut COUNTER: u64 = 0;

fn handle_request(request: &Request) -> String {
    if let Some(url) = &request.url {
        let count;
        // This is not unsafe because WASM can only run in single-threaded environments
        unsafe {
            COUNTER += 1;
            count = COUNTER;
        }
        format!("<div>Hey <b>Darrly</b>, this html is generated from Rust WASM using a service worker that intercepts http calls and returns HTML for {} <br><div>Count: {}</div>", url, count).to_string()
    } else {
        "error".to_string()
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct Request {
    method: Option<String>,
    url: Option<String>,
}

struct RoutingState {
    request: Option<Vec<u8>>,
    response: Option<String>,
}

static ROUTING_STATE: Mutex<RoutingState> = Mutex::new(RoutingState {
    request: None,
    response: None,
});

fn get_routing_state() -> MutexGuard<'static, RoutingState> {
    ROUTING_STATE.lock().unwrap()
}

#[no_mangle]
pub extern "C" fn allocate_request(size: usize) -> *mut u8 {
    let mut rs = get_routing_state();
    rs.request = Some(vec![0; size]);
    rs.request.as_mut().unwrap().as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn fetch() -> usize {
    let mut rs = get_routing_state();
    let request_string = if let Some(ref request) = rs.request {
        String::from_utf8(request.clone()).unwrap()
    } else {
        String::from("{}")
    };
    let request: Request = serde_json::from_str(&request_string).unwrap();
    rs.response = Some(handle_request(&request));
    0
}

#[no_mangle]
pub extern "C" fn response_ptr() -> *const u8 {
    let rs = get_routing_state();

    if let Some(r) = &rs.response {
        r.as_ptr()
    } else {
        0 as *const u8
    }
}

#[no_mangle]
pub extern "C" fn response_len() -> usize {
    let rs = get_routing_state();

    if let Some(r) = &rs.response {
        r.len()
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn stop() -> usize {
    0
}
