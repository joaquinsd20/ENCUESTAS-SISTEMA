// Utilidades de interfaz compartidas
export function mostrarToast(mensaje, tipo = "exito", duracion = 3000) {
  const contenedor = document.getElementById("toast-contenedor") || crearContenedor();
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  contenedor.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("salir");
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

function crearContenedor() {
  const div = document.createElement("div");
  div.id = "toast-contenedor";
  document.body.appendChild(div);
  return div;
}

export function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : String(texto);
  return div.innerHTML;
}

export function inicialesDe(correo) {
  if (!correo) return "?";
  const parte = correo.split("@")[0] || "u";
  return parte.slice(0, 2).toUpperCase();
}

export function formatoFecha(fecha) {
  if (!fecha) return "—";
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) + ", " +
         fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export function esMismoDia(fecha) {
  const ahora = new Date();
  return fecha.getFullYear() === ahora.getFullYear() &&
         fecha.getMonth() === ahora.getMonth() &&
         fecha.getDate() === ahora.getDate();
}

// Devuelve un objeto Date normalizado, venga lo que venga de Firestore
export function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

export function estaEnLinea() {
  return navigator.onLine;
}

// Muestra una franja fija cuando no hay conexión a internet
export function conectarIndicadorOffline() {
  if (document.getElementById("banner-offline")) return;

  const banner = document.createElement("div");
  banner.id = "banner-offline";
  banner.className = "banner-offline oculto";
  banner.textContent = "📡 Sin conexión: las encuestas se guardan en el dispositivo y se sincronizarán automáticamente al recuperar la señal.";
  document.body.appendChild(banner);

  const actualizar = () => {
    const offline = !navigator.onLine;
    banner.classList.toggle("oculto", !offline);
    banner.classList.toggle("visible", offline);
  };

  window.addEventListener("offline", () => {
    actualizar();
    mostrarToast("Sin conexión. Guardaremos en el dispositivo.", "error", 4000);
  });
  window.addEventListener("online", () => {
    actualizar();
    mostrarToast("Conexión restablecida. Sincronizando...", "exito", 4000);
  });

  actualizar();
}

conectarIndicadorOffline();
