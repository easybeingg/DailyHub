/* Daily Hub offline support.
   Always tries the internet first (so updates show up on their own),
   and falls back to the saved copy when there is no connection. */
var CACHE = 'dailyhub-v1';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(['./']); }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase etc. go straight to the network
  e.respondWith(networkFirst(req));
});

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit;
      return c.match('./');
    });
  });
}

function networkFirst(req) {
  var net = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      var copy2 = req.mode === 'navigate' ? res.clone() : null;
      caches.open(CACHE).then(function (c) {
        c.put(req, copy);
        if (copy2) c.put('./', copy2);
      });
    }
    return res;
  });
  /* slow connection (e.g. in the gym): use the saved copy after 4 seconds */
  var slow = new Promise(function (resolve) {
    setTimeout(function () { fromCache(req).then(function (hit) { if (hit) resolve(hit); }); }, 4000);
  });
  return Promise.race([
    net.catch(function () { return fromCache(req).then(function (hit) { return hit || Response.error(); }); }),
    slow
  ]);
}
