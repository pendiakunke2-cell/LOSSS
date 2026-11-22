// Service worker sederhana: file aplikasi disimpan sebagai cadangan.
// Data Supabase TIDAK pernah disimpan di sini (selalu diambil langsung dari internet).
const CACHE = "tabungan-hp-v1";
const FILES = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase & CDN lewat langsung
  // Coba internet dulu (supaya selalu versi terbaru), kalau gagal pakai cadangan
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
