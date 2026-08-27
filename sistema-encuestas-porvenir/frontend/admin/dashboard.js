import { db } from "../firebase-config.js";
import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { aFecha, esMismoDia, escaparHTML, mostrarToast } from "../ui.js";
import { CANDIDATOS_CORTOS } from "../candidatos.js";
import { exportarCSV, exportarReporteExcel } from "../exportar-datos.js";

// ---- Protección de ruta: exige rol administrador ----
const usuario = await protegerSesion("../index.html", "admin");

// ---- Menú lateral móvil ----
document.getElementById("btn-menu").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-abierta");
});
document.getElementById("cerrar-sidebar").addEventListener("click", () => {
    document.body.classList.remove("sidebar-abierta");
});

// ---- Cierre de sesión ----
document.getElementById("btn-salir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
});

// ---- Datos del usuario ----
document.getElementById("avatar-admin").textContent = (usuario.email || "A").slice(0, 1).toUpperCase();
document.getElementById("nombre-admin").textContent = usuario.email || "Administrador";

const COLORES = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#dc2626", "#db2777", "#0891b2", "#4d7c0f"];

let encuestas = [];

async function cargarDatos() {
    try {
        const snap = await getDocs(collection(db, "encuestas"));
        encuestas = [];
        snap.forEach((doc) => {
            const data = doc.data();
            data._id = doc.id;
            encuestas.push(data);
        });

        const total = encuestas.length;

        let hoy = 0;
        const activosHoy = new Set();
        const zonas = new Set();
        const porCandidato = new Map();
        const porZona = new Map();

        encuestas.forEach((enc) => {
            const fecha = aFecha(enc.fecha);
            if (fecha && esMismoDia(fecha)) {
                hoy++;
                if (enc.encuestador) activosHoy.add(enc.encuestador);
            }
            if (enc.sector) zonas.add(enc.sector.replace(/^Otro:\s*/, ""));
            const c = enc.candidatoFijo || "Sin dato";
            porCandidato.set(c, (porCandidato.get(c) || 0) + 1);
            const z = enc.sector || "Sin sector";
            porZona.set(z, (porZona.get(z) || 0) + 1);
        });

        document.getElementById("total-encuestas").textContent = total;
        document.getElementById("encuestas-hoy").textContent = hoy;
        document.getElementById("encuestadores-hoy").textContent = activosHoy.size;
        document.getElementById("zonas-cubiertas").textContent = zonas.size;

        renderCandidatos(porCandidato, total);
        renderZonas(porZona);
        renderUltimasEncuestas();
        renderRendimiento();
    } catch (error) {
        console.error("Error al cargar el dashboard:", error);
        mostrarToast("No se pudieron cargar los datos.", "error");
    }
}

function renderUltimasEncuestas() {
    const cont = document.getElementById("ultimas-encuestas");
    const ultimas = encuestas
        .slice()
        .sort((a, b) => (aFecha(b.fecha) || 0) - (aFecha(a.fecha) || 0))
        .slice(0, 10);

    if (ultimas.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">🗒️</div>Aún no hay encuestas registradas.</div>';
        return;
    }

    cont.innerHTML = `
        <div class="tabla-wrap">
            <table class="tabla">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Encuestador</th>
                        <th>Sector</th>
                        <th>Intención de voto</th>
                        <th style="text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${ultimas.map((e) => {
                        const fecha = aFecha(e.fecha);
                        return `
                        <tr>
                            <td class="mono">${fecha ? fecha.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                            <td>${escaparHTML(e.encuestador || "—")}</td>
                            <td>${escaparHTML(e.sector || "—")}</td>
                            <td>${escaparHTML(CANDIDATOS_CORTOS[e.candidatoFijo] || e.candidatoFijo || "—")}</td>
                            <td style="text-align:right;">
                                <button class="btn-accion eliminar" data-id="${e._id}" title="Eliminar encuesta">🗑️</button>
                            </td>
                        </tr>`;
                    }).join("")}
                </tbody>
            </table>
        </div>`;
}

// ---- Eliminar encuesta (permiso de administrador) ----
document.getElementById("ultimas-encuestas").addEventListener("click", async (e) => {
    const boton = e.target.closest(".eliminar");
    if (!boton) return;

    const id = boton.dataset.id;
    if (!confirm("¿Eliminar esta encuesta? Esta acción no se puede deshacer.")) return;

    try {
        await deleteDoc(doc(db, "encuestas", id));
        mostrarToast("Encuesta eliminada.", "exito");
        cargarDatos();
    } catch (error) {
        console.error("Error al eliminar:", error);
        mostrarToast("No se pudo eliminar la encuesta.", "error");
    }
});

// ---- Descarga de la base completa ----
const fechaHoy = new Date();
const sufijo = `${fechaHoy.getFullYear()}-${String(fechaHoy.getMonth() + 1).padStart(2, "0")}-${String(fechaHoy.getDate()).padStart(2, "0")}`;

document.getElementById("btn-descargar-csv").addEventListener("click", () => {
    if (encuestas.length === 0) {
        mostrarToast("Aún no hay encuestas para descargar.", "error");
        return;
    }
    exportarCSV(encuestas, `encuestas-${sufijo}.csv`);
    mostrarToast(`CSV descargado con ${encuestas.length} encuestas.`, "exito");
});

document.getElementById("btn-descargar-excel").addEventListener("click", async () => {
    if (encuestas.length === 0) {
        mostrarToast("Aún no hay encuestas para descargar.", "error");
        return;
    }
    try {
        await exportarReporteExcel(encuestas);
        mostrarToast(`Excel descargado con ${encuestas.length} encuestas y gráficos.`, "exito");
    } catch (error) {
        mostrarToast(error.message, "error");
    }
});

cargarDatos();

function renderCandidatos(porCandidato, total) {
    const cont = document.getElementById("top-candidatos");
    const orden = [...porCandidato.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    if (total === 0 || orden.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">🗳️</div>Aún no hay encuestas registradas.</div>';
        return;
    }

    const max = orden[0][1];
    cont.innerHTML = orden.map(([candidato, n], i) => {
        const pct = Math.round((n / total) * 100);
        return `
            <div class="barra-item">
                <div class="barra-cabeza">
                    <span class="barra-nombre">${escaparHTML(CANDIDATOS_CORTOS[candidato] || candidato)}</span>
                    <span class="barra-valor">${n} · ${pct}%</span>
                </div>
                <div class="barra-fondo">
                    <div class="barra-llena" style="width:${Math.round((n / max) * 100)}%;background:${COLORES[i % COLORES.length]};"></div>
                </div>
            </div>`;
    }).join("");
}

function renderZonas(porZona) {
    const cont = document.getElementById("top-zonas");
    const orden = [...porZona.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    if (orden.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">🏘️</div>Sin datos de zonas.</div>';
        return;
    }

    const max = orden[0][1];
    cont.innerHTML = orden.map(([zona, n], i) => `
        <div class="barra-item">
            <div class="barra-cabeza">
                <span class="barra-nombre">${escaparHTML(zona)}</span>
                <span class="barra-valor">${n}</span>
            </div>
            <div class="barra-fondo">
                <div class="barra-llena" style="width:${Math.round((n / max) * 100)}%;background:${COLORES[i % COLORES.length]};"></div>
            </div>
        </div>`).join("");
}

// ---- Rendimiento del equipo: encuestas de hoy vs meta diaria ----
async function renderRendimiento() {
    const cont = document.getElementById("rendimiento-equipo");

    try {
        const snapUsuarios = await getDocs(collection(db, "usuarios"));
        const metas = new Map();
        snapUsuarios.forEach((u) => {
            const data = u.data();
            if (data.rol === "encuestador") metas.set(data.correo, data.metaDiaria || 0);
        });

        const hoyPorCorreo = new Map();
        const totalPorCorreo = new Map();
        encuestas.forEach((enc) => {
            const fecha = aFecha(enc.fecha);
            if (!enc.encuestador) return;
            totalPorCorreo.set(enc.encuestador, (totalPorCorreo.get(enc.encuestador) || 0) + 1);
            if (fecha && esMismoDia(fecha)) {
                hoyPorCorreo.set(enc.encuestador, (hoyPorCorreo.get(enc.encuestador) || 0) + 1);
            }
        });

        const correos = new Set([...metas.keys(), ...hoyPorCorreo.keys()]);
        const filas = [...correos].map((correo) => ({
            correo,
            meta: metas.get(correo) || 0,
            hoy: hoyPorCorreo.get(correo) || 0,
            total: totalPorCorreo.get(correo) || 0
        })).sort((a, b) => (b.hoy - a.hoy) || (b.total - a.total));

        if (filas.length === 0) {
            cont.innerHTML = '<div class="vacio"><div class="icono">👥</div>Aún no hay encuestadores con actividad.</div>';
            return;
        }

        cont.innerHTML = `
            <div class="tabla-wrap">
                <table class="tabla">
                    <thead>
                        <tr>
                            <th>Encuestador</th>
                            <th>Hoy</th>
                            <th>Meta</th>
                            <th style="min-width:180px;">Avance</th>
                            <th>Cumplimiento</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas.map((f) => {
                            const pct = f.meta > 0 ? Math.round((f.hoy / f.meta) * 100) : 0;
                            const badge = f.meta > 0 && f.hoy >= f.meta
                                ? '<span class="badge badge-verde">● Cumplida</span>'
                                : f.meta > 0 && pct >= 50
                                    ? '<span class="badge badge-ambar">◐ En camino</span>'
                                    : '<span class="badge badge-rojo">○ Baja</span>';
                            const color = f.hoy >= f.meta ? "var(--exito)" : (pct >= 50 ? "var(--acento)" : "var(--peligro)");
                            return `
                            <tr>
                                <td><strong>${escaparHTML(f.correo)}</strong></td>
                                <td class="mono">${f.hoy}</td>
                                <td class="mono">${f.meta || "—"}</td>
                                <td>
                                    <div class="barra-fondo">
                                        <div class="barra-llena" style="width:${Math.min(100, pct)}%;background:${color};"></div>
                                    </div>
                                </td>
                                <td>${f.meta > 0 ? `${pct}% · ${badge}` : '<span class="texto-suave">sin meta</span>'}</td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        console.error("Error al cargar el rendimiento:", error);
        cont.innerHTML = '<div class="vacio"><div class="icono">⚠️</div>No se pudo cargar el rendimiento.</div>';
    }
}
