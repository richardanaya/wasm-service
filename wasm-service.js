const  utf8dec = new TextDecoder("utf-8");
const utf8enc = new TextEncoder();

let appInstance;

function readUtf8FromMemory(start, len) {
  const memory = new Uint8Array(appInstance.exports.memory.buffer);
  const text = utf8dec.decode(
    memory.subarray(start, start + len)
  );
  return text;
}

function writeUtf8ToMemory (bytes, start) {
  const memory = new Uint8Array(appInstance.exports.memory.buffer);
  memory.set(bytes, start);
}

WebAssembly.instantiateStreaming(fetch("app.wasm"), {}).then((results) => {
  appInstance = results.instance;
});

const waitForAppInstance = () =>
  new Promise((resolve) => {
    if (appInstance) {
      resolve(appInstance);
    } else {
      setTimeout(() => waitForAppInstance(resolve), 100);
    }
  });

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const appIndex = event.request.url.indexOf("/wasm/");
  if (appIndex > -1) {
    waitForAppInstance().then((appInstance) => {
      const request = JSON.stringify({
        method: event.request.method,
        url: event.request.url
      });
      const bytes = utf8enc.encode(request);
      const len = bytes.length;
      const requestPtr = appInstance.exports.allocate_request(len);
      writeUtf8ToMemory(bytes, requestPtr);
      const responseHandle = appInstance.exports.fetch();
      const responsePtr = appInstance.exports.response_ptr();
      const responseLen = appInstance.exports.response_len();
      const responseContent = readUtf8FromMemory(responsePtr, responseLen);;
      event.respondWith(
        new Response(responseContent, {
          headers: { "Content-Type": "text/html" },
        })
      );
    });
  } else {
    event.respondWith(fetch(event.request));
  }
});
