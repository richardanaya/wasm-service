# wasm-service

This is a simple proof of concept that shows how you could use HTMX and Rust for frontend development. The basic idea in HTMX is that a webserver is being called on interactions with DOM elements, and returning back snippets of HTML that will replace certain DOM elements. Instead of http requests going to a regular web server, this project shows how service workers can intercept calls to a server and return back responses driven from WebAssembly instead.

See the demo here: https://richardanaya.github.io/wasm-service/

# Developing `wasm-service`

## Install & build

Install the WASM target via `rustup` in order to compile to wasm binaries:

```sh
rustup target add wasm32-unknown-unknown
```

Compile the lib crate into `wasm_service.wasm`:

```sh
cargo build --target wasm32-unknown-unknown --release
```

Copy the `.wasm` file to `app.wasm` in current dir:

```sh
cp target/wasm32-unknown-unknown/release/wasm_service.wasm app.wasm
```

## Serve repo root dir on localhost http

Use any method to serve the files from the root dir (in particular `index.js`, `sw.js`, and `app.wasm`). Note you need to serve on localhost or via https for service workers to be enabled. Here's how you can do it with [`caddy`](https://caddyserver.com/) in bash:

```
caddy run --adapter caddyfile --config - <<< $'http://127.0.0.1:8000 \n log \n root / . \n file_server browse'
```

## Rebuild and run automatically with `cargo watch`

Install:

```sh
cargo install cargo-watch
```

Build and copy on change:

```sh
cargo watch -i app.wasm -x 'build --target wasm32-unknown-unknown --release' -s 'cp target/wasm32-unknown-unknown/release/wasm_service.wasm app.wasm'
```

## Resources for developing with service workers

* [Service Worker API @ MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
* [Workers overview @ web.dev](https://web.dev/workers-overview/)
* `about:debugging` in firefox
* Open serviceworker console `about:devtools-toolbox?id=<service-worker-id>&type=worker`
