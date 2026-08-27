// El Porvenir Opina — Service Worker (PWA)
// Guarda la aplicación en el dispositivo para funcionar sin conexión.
const CACHE = "elporvenir-opina-v6";

const PRECACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./style.css",
  "./login.js",
  "./guard.js",
  "./ui.js",
  "./firebase-config.js",
  "./candidatos.js",
  "./sectores.js",
  "./exportar-datos.js",
  "./csv-import.js",
  "./manifest.webmanifest",
  "./assets/icono-192.png",
  "./assets/icono-512.png",
  "./assets/ingreso-al-distrito-el-porvenir-de-trujllo-com.jpg",
  "./encuestador/nueva-encuesta.html",
  "./encuestador/encuesta.js",
  "./encuestador/mi-progreso.html",
  "./encuestador/mi-progreso.js",
  "./encuestador/estadisticas.html",
  "./encuestador/estadisticas.js",
  "./admin/dashboard.html",
  "./admin/dashboard.js",
  "./admin/estadisticas.html",
  "./admin/estadisticas.js",
  "./admin/directorio.html",
  "./admin/directorio.js"
];

// Instalación: descarga los archivos base
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpia versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Solicitudes:
//  - Navegación: red primero, con respaldo de caché (siempre lo nuevo).
//  - Recursos propios (JS/CSS): caché primero y actualización en segundo plano
//    (stale-while-revalidate). Rápido y offline, pero las mejoras llegan solas.
//  - CDN (Firebase/Chart.js/exceljs): caché primero (versiones fijas).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navegación entre páginas
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
          return respuesta;
        })
        .catch(() =>
          caches.match(request).then(
            (enCache) => enCache || caches.match("./index.html")
          )
        )
    );
    return;
  }

  // Recursos propios (nuestro JS/CSS/HTML): caché primero + refresco en segundo plano
  if (url.origin === self.location.origin && request.method === "GET") {
    event.respondWith(
      caches.match(request).then((enCache) => {
        const refresco = fetch(request)
          .then((respuesta) => {
            if (respuesta && respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copia));
            }
            return respuesta;
          })
          .catch(() => enCache);
        return enCache || refresco;
      })
    );
    return;
  }

  // CDN (Firebase, Chart.js, exceljs)
  event.respondWith(
    caches.match(request).then((enCache) => {
      if (enCache) return enCache;
      return fetch(request).then((respuesta) => {
        const cacheable =
          respuesta.ok &&
          (url.hostname.includes("gstatic.com") ||
            url.hostname.includes("jsdelivr.net") ||
            url.hostname.includes("unpkg.com"));
        if (cacheable) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return respuesta;
      });
    })
  );
});
