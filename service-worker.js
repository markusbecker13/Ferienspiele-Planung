// Service Worker für die Ferienspiele-App.
//
// Ziel: App installierbar machen + App-Grundgerüst (Shell) auch bei
// wackliger Verbindung sofort anzeigen. Bewusst NICHT die Supabase-Daten
// cachen — Programm, Personal, Kinder-Anmeldungen etc. sollen immer aktuell
// vom Server kommen, nie aus einem alten Cache.
//
// Bei Änderungen an dieser Datei: CACHE_NAME hochzählen (z.B. v3, v4),
// sonst behalten Nutzer den alten Stand, bis der Browser von selbst
// aktualisiert (kann Stunden/Tage dauern).
const CACHE_NAME = "ferienspiele-shell-v3";

// Grundgerüst der App selbst. Schriften und Bibliotheken liegen seit
// 11/2026 lokal (DSGVO: keine Verbindung zu Google/CDN). Keine Supabase-URLs.
const SHELL_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./fonts/fonts.css",
  "./fonts/inter-latin-400-normal.woff2",
  "./fonts/inter-latin-500-normal.woff2",
  "./fonts/inter-latin-600-normal.woff2",
  "./fonts/fraunces-latin-500-normal.woff2",
  "./fonts/fraunces-latin-700-normal.woff2",
  "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-500-normal.woff2",
  "./vendor/xlsx.full.min.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/mammoth.browser.min.js",
];

self.addEventListener("install", (event) => {
  // Jede Datei einzeln ablegen: fehlt eine (404), scheitert nicht die ganze
  // Installation (cache.addAll bricht bei EINEM Fehler komplett ab).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((e) => console.warn("SW: nicht gecacht:", url, e))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Alte Cache-Versionen aufräumen, sobald eine neue Version aktiv wird.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Nur eigene GET-Anfragen auf die App-Shell selbst behandeln.
  // Alles Fremde (Supabase-API, POST-Aufrufe an die Edge Function) läuft
  // ganz normal am Service Worker vorbei direkt ins Netz — sonst gäbe es
  // veraltete Daten oder kaputte Logins.
  const url = new URL(req.url);
  const istEigeneSeite = url.origin === self.location.origin;
  if (req.method !== "GET" || !istEigeneSeite) {
    return;
  }

  // Für die Haupt-HTML-Datei: zuerst Netz versuchen (immer aktuellste
  // Version), nur bei fehlender Verbindung auf den Cache zurückfallen.
  if (req.mode === "navigate" || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const kopie = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, kopie));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Für restliche eigene Dateien (Manifest, Icons, Schriften, Bibliotheken):
  // Cache zuerst, das reicht für diese statischen Dateien und ist schneller.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
