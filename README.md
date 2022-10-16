# wasm-service

This is a simple proof of concept that shows how you could use HTMX and Rust for frontend development. The basic idea in HTMX is that a webserver is being called on interactions with DOM elements, and returning back snippets of HTML that will replace certain DOM elements. Instead of going to a real web serviceWorker this project shows how service workers can intercept calls to a server and return back responses driven from WebAssembly instead.

See the demo here: https://richardanaya.github.io/wasm-service/
