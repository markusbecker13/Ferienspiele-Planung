// Service Worker für die Ferienspiele-App.
//
// Ziel: App installierbar machen + App-Grundgerüst (Shell) auch bei
// wackliger Verbindung sofort anzeigen. Bewusst NICHT die Supabase-Daten
// cachen — Programm, Personal, Kinder-Anmeldungen etc. sollen immer aktuell
// vom Server kommen, nie aus einem alten Cache.
//
// Bei Änderungen an dieser Datei: CACHE_NAME hochzählen (z.B. v2, v3),
// sonst behalten Nutzer den alten Stand, bis der Browser von selbst
// aktualisiert (kann Stunden/Tage dauern).
const CACHE_NAME = "ferienspiele-shell-v1";

// Nur die Grundgerüst-Dateien der App selbst — keine Supabase-URLs,
// keine Google-Fonts-Adresse (die lädt der Browser ganz normal per Fetch,
// hier reinnehmen würde bei Offline-Start nur zu Fehlern führen).
const SHELL_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
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
  // Alles Fremde (Supabase-API, Supabase-Realtime, Google Fonts, POST-
  // Aufrufe an die Edge Function) läuft ganz normal am Service Worker
  // vorbei direkt ins Netz — sonst gäbe es veraltete Daten oder kaputte
  // Logins.
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
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Für restliche eigene Dateien (Manifest, Icons): Cache zuerst, das
  // reicht für diese statischen Dateien und ist schneller.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
