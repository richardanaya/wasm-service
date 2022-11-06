use html_to_string_macro::html;
use matchit::Router;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use url::Url;

// Routing: https://docs.rs/matchit/latest/matchit/
// html! macro: https://docs.rs/html-to-string-macro/latest/html_to_string_macro/macro.html.html

static COUNTER: Mutex<u64> = Mutex::new(0);

fn index(request: &Request) -> String {
    html! {
        <html>
        <head>
            <title>"Hello WASM Service Worker"</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css" />
            <script src="https://unpkg.com/htmx.org@1.8.2" />
            <script>r#"
            const registerServiceWorker = async () => {
                if ("serviceWorker" in navigator) {
                try {
                    const registration = await navigator.serviceWorker.register("sw.js", { scope: location.origin, });
                    if (registration.installing) {
                    console.log("Service worker installing");
                    } else if (registration.waiting) {
                    console.log("Service worker installed");
                    } else if (registration.active) {
                    console.log("Service worker active");
                    }
                    console.log("Notifying serviceWorker", navigator.serviceWorker.controller.postMessage({ type: 'clientloaded' }));
                } catch (error) {
                    console.error(`Registration failed with ${error}`);
                }
                } else {
                console.error("serviceWorker is missing from `navigator`. Note that service workers require https or serving from localhost");
                }
            };
            registerServiceWorker();"#
            </script>
        </head>
        <body>
            <h1>"HTMLX + Service Workers + WebAssembly + Rust"</h1>
            <div>
                "This is a simple proof of concept that shows how you could use"
                <a href="https://htmx.org/">"HTMX"</a> "and Rust for frontend development.
                The basic idea in HTMX is that a webserver is being called on interactions
                with DOM elements, and returning back snippets of HTML that will replace
                certain DOM elements. Instead of going to a real web serviceWorker this
                project shows how service workers can intercept calls to a server and
                return back responses driven from WebAssembly instead."
                <br />
                "Repo: "<a href="https://github.com/richardanaya/wasm-service">"https://github.com/richardanaya/wasm-service"</a>
            </div>
            <br />
            <button hx-post="/wasm/clicked" hx-swap="innerHTML" hx-target="#target">"Click Me"</button>
            <div>
                <div id="target">{ wasm_clicked(request) }</div>
            </div>
        </body>
        </html>
    }
}

fn wasm_clicked(request: &Request) -> String {
    let n = {
        let mut c = COUNTER.lock().unwrap();
        *c += 1;
        *c
    };
    html! {
        <div>
            "Hey <b>Darrly</b>, this html is generated from Rust WASM using"
            " a service worker that intercepts http calls and returns HTML for "
            { &request.url }
            <br />
            { counter_component(n) }
        </div>
    }
}

fn counter_component(count: u64) -> String {
    html! { <p>"Count: " { count }</p> }
}

fn not_found(_request: &Request) -> String {
    html! {
        <p>"404 Not Found"</p>
    }
}

fn error(_request: &Request) -> String {
    html! {
        <p>"Error"</p>
    }
}

lazy_static::lazy_static! {
    static ref ROUTER: Router<fn(&Request) -> String> = {
        let mut router: Router<fn(&Request) -> String> = Router::new();
        router.insert("/", index).unwrap();
        router.insert("/wasm/clicked", wasm_clicked).unwrap();
        router
    };
}

fn handle_request(request: &Request) -> String {
    let Ok(url) = Url::parse(request.url.as_str()) else {
        return "Could not parse url".to_string();
    };

    let handler = match ROUTER.at(url.path()) {
        Ok(ok) => ok.value,
        Err(matchit::MatchError::NotFound) => &(not_found as fn(&Request) -> String),
        Err(_) => &(error as fn(&Request) -> String),
    };

    handler(request).to_string()
}

#[derive(Serialize, Deserialize, Debug)]
struct Request {
    method: String,
    url: String,
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
    rs.response = match serde_json::from_str(&request_string) {
        Ok(request) => Some(handle_request(&request)),
        Err(_) => Some("Failed to parse request string from service worker js".to_string()),
    };
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
