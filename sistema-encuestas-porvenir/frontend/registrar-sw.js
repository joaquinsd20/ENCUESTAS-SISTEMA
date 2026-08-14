// Registra el service worker (PWA). La ruta se calcula desde este mismo
// archivo, por lo que funciona desde cualquier carpeta (local y producción).
if ("serviceWorker" in navigator) {
  const scriptSrc = document.currentScript ? document.currentScript.src : null;
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", scriptSrc || location.href);
    navigator.serviceWorker
      .register(swUrl, { scope: new URL("./", swUrl).pathname })
      .catch((error) => console.error("No se pudo registrar el service worker:", error));
  });
}
