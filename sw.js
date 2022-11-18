// sw.js defines and manages the lifecycle of a Service Worker for this domain.
//
// Work is performed by passing events to the a local WASM instance whose
// definition is located at $appUri.
//
// Periodically, the worker checks to see if the app definition at $appUri has
// changed. If the app definition has changed it creates a new instance and
// switches to it.
//
// If this service worker definition changes, it automatically reloads itself.

////**** Helper Definitions ****////

// ExplodedPromise returns a tuple of: a promise, a function to call with a
// value to resolve that promise, a function to call to reject that
// promise, and a method on the promise to get the current state.
const ExplodedPromise = () => {
  var status = "pending", value = null;
  const get = () => ({ status, value });
  var resolve, reject;
  var promise = new Promise((_resolve, _reject) => {
    resolve = (_value) => {
      status = "resolved";
      value = _value;
      _resolve(_value);
    };
    reject = (_value) => {
      status = "rejected"
      value = _value;
      _reject(_value)
    };
  });
  return [promise, get, resolve, reject];
};

/// skewnormal(..) returns a random number from the normal distribution that has
/// been streched and offset to range from `min` to `max`, skewed with `skew`,
/// and truncated to `sigma` standard deviations. See https://stackoverflow.com/a/74258559/213246
const skewnormal = (min, max, skew = 1, sigma = 4) => {
  /// normal() returns a random number from the standard normal distribution.
  /// Uses the Box-Muller transform.
  const normal = () => Math.sqrt(-2.0 * Math.log(Math.random())) * Math.cos(2.0 * Math.PI * Math.random());

  /// normal01(..) returns normally distributed random number, whose range is
  /// truncated at `sigma` standard deviations and shifted to interval `[0, 1]`.
  const normal01 = (sigma = 4) => {
    while (true) {
      let num = normal() / (sigma * 2.0) + 0.5; // translate to [0, 1]
      if (0 <= num && num <= 1) return num;     // ok if in range, else resample
    }
  };

  var num = normal01(sigma);
  num = Math.pow(num, skew); // skew
  num *= max - min; // stretch to fill range
  num += min; // offset to min
  return num;
}

////**** Service Worker & WebAssembly instance lifecycle management ****////

const appUri = "/app.wasm";

// Enable debug logging on a running instance by setting DEBUG=true in the console.
var DEBUG = false;

var WasmApp, WasmAppStatus;

const LoadWasmApp = (() => {
  var locked = false;
  var currentEtag;

  var resolveApp, rejectApp;
  [WasmApp, WasmAppStatus, resolveApp, rejectApp] = ExplodedPromise();

  return async (trigger = "unknown" /* for debugging */) => {
    if (locked) {
      console.log("skipped redundant checking for new App", { trigger });
      return;
    }
    try {
      locked = true;

      // Check for new version. Assume a competent server that either does not
      // implement ETags and 304 Not Modified at all OR it implementes them correctly
      let response = await fetch(appUri, { cache: "no-cache" });

      // Skip updating if etag matches
      let newEtag = response.headers.get('etag');
      if (newEtag && newEtag === currentEtag) {
        console.log("skipped reinstalling App with matching etag", { trigger, etag: newEtag });
        locked = false;
        return;
      }

      {
        var { status, value } = WasmAppStatus();
        if (status === "resolved") {
          console.log("stopping old App", { trigger, etag: currentEtag });

          // Reset App promise so any new clients wait until the new App is installed
          [WasmApp, WasmAppStatus, resolveApp, rejectApp] = ExplodedPromise();

          // Call exported stop method on old App
          value.exports.stop();
        }
        // references to old App fall out of scope and should be GC'd
      }

      try {
        console.log("installing new App", { trigger, newEtag });
        newApp = await WebAssembly.instantiateStreaming(response, {});
        resolveApp(newApp.instance);
        currentEtag = newEtag;
      } catch (error) {
        console.error("failed to install new App", { error })
        rejectApp(error);
      }
    } catch (error) {
      console.error("error thrown while updating app", { error })
    }
    finally {
      locked = false;
    }
  };
})();

// Periodically check for new wasm app version, randomizing the check interval
// per client. Note this will still follow server's cache-control policy.
setInterval(() => LoadWasmApp("interval"), skewnormal(5, 15) * 60 * 1000); // 5-15 min

self.addEventListener("install", (event) => {
  console.log("received service worker lifecycle event: install");
  event.waitUntil(LoadWasmApp("install"));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("received service worker lifecycle event: activate");
  event.waitUntil(LoadWasmApp("activate"));
  event.waitUntil(clients.claim());
});

// Check for a new app when a new client loads
self.addEventListener('message', (event) => {
  if (event.data.type === 'clientattached') {
    console.log("received message", { type: event.data.type, event });
    event.waitUntil(LoadWasmApp("clientattached"));
  }
});

////**** Pass fetch events to WASM worker ****////

const utf8dec = new TextDecoder("utf8");
const utf8enc = new TextEncoder();

function readUtf8FromMemory(app, start, len) {
  const memory = new Uint8Array(app.exports.memory.buffer);
  const text = utf8dec.decode(
    memory.subarray(start, start + len)
  );
  return text;
}

function writeUtf8ToMemory(app, bytes, start) {
  const memory = new Uint8Array(app.exports.memory.buffer);
  memory.set(bytes, start);
}

self.addEventListener("fetch", (event) => {
  let url = new URL(event.request.url);
  const ignored = ["/sw.js", "/app.wasm"];

  let shouldOverride = url.origin === event.target.location.origin
    && !url.pathname.startsWith("/assets/")
    && !ignored.includes(url.pathname)
    && WasmAppStatus().status === "resolved";

  if (DEBUG) console.log("fetch event received", { overriding: shouldOverride, method: event.request.method, url, event })

  if (!shouldOverride) {
    return; // fall back to browser default fetch handling
  }

  event.respondWith((async () => {
    try {
      const app = await WasmApp;

      const request = JSON.stringify({
        method: event.request.method,
        url: event.request.url,
        headers: Array.from(event.request.headers),
        body: await event.request.text(),
      });

      if (DEBUG) console.log("fetch request sent to wasm:", request);

      const bytes = utf8enc.encode(request);
      const len = bytes.length;
      const requestPtr = app.exports.allocate_request(len);
      writeUtf8ToMemory(app, bytes, requestPtr);
      const responseHandle = app.exports.fetch();
      const responsePtr = app.exports.response_ptr();
      const responseLen = app.exports.response_len();
      const responseContent = readUtf8FromMemory(app, responsePtr, responseLen);

      if (DEBUG) console.log("fetch response from wasm:", responseContent);

      return new Response(responseContent, {
        headers: { "Content-Type": "text/html" },
      });
    } catch (error) {
      console.error("error querying wasm app for result", { error, event });
    }
  })());
});
