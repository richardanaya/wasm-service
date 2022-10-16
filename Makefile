run:
	cargo build --release --target wasm32-unknown-unknown
	cp target/wasm32-unknown-unknown/release/wasm_service.wasm ./app.wasm
	python3 -m http.server 8060