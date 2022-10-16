let appInstance;

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

self.addEventListener("fetch", (event) => {
  const appIndex = event.request.url.indexOf("/wasm/");
  if (appIndex > -1) {
    waitForAppInstance().then((appInstance) => {
      const request = JSON.stringify({
        method: event.request.method,
        url: event.request.url
      });
      console.log(request);
      const responseHandle = appInstance.exports.add(2,2);
      const responseContent = "<h1>Hello!</h1> "+responseHandle;
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
