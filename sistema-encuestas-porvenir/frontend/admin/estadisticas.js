import { db } from "../firebase-config.js";
import { collection, getDocs, getDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { escaparHTML, mostrarToast, aFecha } from "../ui.js";
import { CANDIDATOS, CANDIDATOS_CORTOS } from "../candidatos.js";
import { normalizarClave, parsearCSV, normalizarFecha, limpiarTexto } from "../csv-import.js";
import { exportarCSV, exportarReporteExcel } from "../exportar-datos.js";
import { SECTORES_COORDS, SECTOR_CENTRO } from "../sectores.js";

// ---- Protección de ruta: exige rol administrador ----
const usuario = await protegerSesion("../index.html", "admin");

document.getElementById("btn-menu").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-abierta");
});
document.getElementById("cerrar-sidebar").addEventListener("click", () => {
    document.body.classList.remove("sidebar-abierta");
});
document.getElementById("btn-salir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
});

document.getElementById("avatar-admin").textContent = (usuario.email || "A").slice(0, 1).toUpperCase();
document.getElementById("nombre-admin").textContent = usuario.email || "Administrador";

const COLORES = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#94a3b8", "#f59e0b"];

let encuestas = [];
let datosActuales = [];
let graficoTorta = null;
let graficoBarras = null;

async function cargarDatos() {
    try {
        const snap = await getDocs(collection(db, "encuestas"));
        encuestas = [];
        snap.forEach((doc) => encuestas.push(doc.data()));

        // Poblar el filtro de sectores
        const sectores = [...new Set(encuestas.map((e) => e.sector || "Sin sector"))].sort();
        const select = document.getElementById("filtro-sector");
        select.innerHTML = '<option value="">Todos los sectores</option>' +
            sectores.map((s) => `<option value="${escaparHTML(s)}">${escaparHTML(s)}</option>`).join("");

        aplicarFiltro();
    } catch (error) {
        console.error("Error al cargar estadísticas:", error);
        mostrarToast("No se pudieron cargar las estadísticas.", "error");
    }
}

function aplicarFiltro() {
    const sector = document.getElementById("filtro-sector").value;
    const datos = sector ? encuestas.filter((e) => (e.sector || "Sin sector") === sector) : encuestas;
    datosActuales = datos;
    renderizar(datos);
}

function renderizar(datos) {
    const total = datos.length;

    const conteo = {};
    CANDIDATOS.forEach((c) => (conteo[c] = 0));
    datos.forEach((e) => {
        if (conteo[e.candidatoFijo] !== undefined) conteo[e.candidatoFijo]++;
        else conteo["Indeciso / No sabe / No precisa"]++;
    });

    const votoDefinido = total - conteo["Indeciso / No sabe / No precisa"] - conteo["Blanco / Nulo / Viciado"];
    const noDefinido = total - votoDefinido;

    const lider = CANDIDATOS.reduce((a, b) => (conteo[a] >= conteo[b] ? a : b), CANDIDATOS[0]);

    document.getElementById("total-encuestas").textContent = total;
    document.getElementById("voto-definido").textContent = total ? Math.round((votoDefinido / total) * 100) + "%" : "—";
    document.getElementById("no-definido").textContent = total ? Math.round((noDefinido / total) * 100) + "%" : "—";
    document.getElementById("lider").textContent = total ? (CANDIDATOS_CORTOS[lider] || lider) : "—";

    // Torta
    const ctxTorta = document.getElementById("grafico-torta").getContext("2d");
    if (graficoTorta) graficoTorta.destroy();
    graficoTorta = new Chart(ctxTorta, {
        type: "doughnut",
        data: {
            labels: CANDIDATOS.map((c) => CANDIDATOS_CORTOS[c]),
            datasets: [{
                data: CANDIDATOS.map((c) => conteo[c]),
                backgroundColor: COLORES,
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.raw;
                            const pct = total ? Math.round((v / total) * 100) : 0;
                            return ` ${ctx.label}: ${v} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Barras
    const ctxBarras = document.getElementById("grafico-barras").getContext("2d");
    if (graficoBarras) graficoBarras.destroy();
    graficoBarras = new Chart(ctxBarras, {
        type: "bar",
        data: {
            labels: CANDIDATOS.map((c) => CANDIDATOS_CORTOS[c]),
            datasets: [{
                label: "Votos",
                data: CANDIDATOS.map((c) => conteo[c]),
                backgroundColor: COLORES,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { font: { size: 10 } } }
            }
        }
    });

    renderTablaSector(datos, total);
    renderMapa(datos);
    renderTablaEncuestador(datos, total);
    renderPerfil(datos);
}

// ---- Mapa de cobertura por sector (Leaflet) ----
let mapa = null;
let capaMapa = null;

function renderMapa(datos) {
    const cont = document.getElementById("mapa-sector");
    if (!cont) return;
    if (typeof L === "undefined") {
        cont.innerHTML = '<div class="vacio"><div class="icono">🗺️</div>El mapa no pudo cargar (revisa tu conexión).</div>';
        return;
    }

    if (!mapa) {
        mapa = L.map("mapa-sector").setView([SECTOR_CENTRO.lat, SECTOR_CENTRO.lng], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mapa);
        setTimeout(() => mapa.invalidateSize(), 200);
    }
    if (capaMapa) capaMapa.clearLayers();

    // Agrupar por sector
    const porSector = new Map();
    datos.forEach((e) => {
        const s = e.sector || "Sin sector";
        if (!porSector.has(s)) porSector.set(s, { total: 0, candidatos: {} });
        const fila = porSector.get(s);
        fila.total++;
        const c = e.candidatoFijo;
        fila.candidatos[c] = (fila.candidatos[c] || 0) + 1;
    });

    capaMapa = L.layerGroup().addTo(mapa);

    let maxTotal = 0;
    porSector.forEach((f) => (maxTotal = Math.max(maxTotal, f.total)));

    porSector.forEach((fila, sector) => {
        const coords = SECTORES_COORDS[sector] || SECTOR_CENTRO;
        // Líder del sector (más votos, priorizando candidatos reales sobre blanco/indeciso)
        const lider = Object.entries(fila.candidatos)
            .sort((a, b) => b[1] - a[1])
            .find(([c]) => c && c !== "Blanco / Nulo / Viciado" && c !== "Indeciso / No sabe / No precisa");
        const nombreLider = lider ? (CANDIDATOS_CORTOS[lider[0]] || lider[0]) : "Sin dato";
        const color = lider ? COLORES[CANDIDATOS.indexOf(lider[0]) % COLORES.length] : "#94a3b8";

        const radio = 6 + (fila.total / maxTotal) * 34;
        const circulo = L.circle([coords.lat, coords.lng], {
            radius: radio * 14,
            color: "#ffffff",
            weight: 2,
            fillColor: color,
            fillOpacity: 0.6
        });

        const detalle = Object.entries(fila.candidatos)
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => `${escaparHTML(CANDIDATOS_CORTOS[c] || c)}: <strong>${n}</strong>`)
            .join("<br>");

        circulo.bindPopup(`
            <div style="font-size:.85rem;min-width:170px;">
                <strong style="display:block;margin-bottom:.35rem;">${escaparHTML(sector)}</strong>
                Encuestas: <strong>${fila.total}</strong><br>
                Líder: <strong>${escaparHTML(nombreLider)}</strong>
                <hr style="margin:.45rem 0;">
                ${detalle}
            </div>`);

        capaMapa.addLayer(circulo);
    });

    // Ajustar la vista si hay muchos sectores mapeables
    if (mapa.getZoom() === 14) mapa.invalidateSize();
}

// Matriz sector × candidato: distribución de votos por cada sector
function renderTablaSector(datos, total) {
    const cont = document.getElementById("tabla-sector");
    const porSector = new Map();
    datos.forEach((e) => {
        const s = e.sector || "Sin sector";
        if (!porSector.has(s)) {
            const fila = { total: 0, candidatos: {} };
            CANDIDATOS.forEach((c) => (fila.candidatos[c] = 0));
            porSector.set(s, fila);
        }
        const fila = porSector.get(s);
        fila.total++;
        const c = e.candidatoFijo;
        if (fila.candidatos[c] !== undefined) fila.candidatos[c]++;
        else fila.candidatos["Indeciso / No sabe / No precisa"]++;
    });

    const sectores = [...porSector.entries()].sort((a, b) => b[1].total - a[1].total);
    if (sectores.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">📍</div>Sin datos.</div>';
        return;
    }

    cont.innerHTML = `
        <div class="tabla-wrap">
            <table class="tabla" style="min-width:760px;">
                <thead>
                    <tr>
                        <th>Sector</th>
                        ${CANDIDATOS.map((c) => `<th style="text-align:center;" title="${escaparHTML(c)}">${escaparHTML(CANDIDATOS_CORTOS[c])}</th>`).join("")}
                        <th style="text-align:center;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${sectores.map(([sector, fila]) => {
                        const conteos = CANDIDATOS.map((c) => fila.candidatos[c]);
                        const maxVotos = Math.max(...conteos);
                        return `
                        <tr>
                            <td><strong>${escaparHTML(sector)}</strong></td>
                            ${CANDIDATOS.map((c, i) => `
                                <td class="mono ${fila.candidatos[c] === maxVotos && maxVotos > 0 ? 'celda-lider' : ''}" style="text-align:center;">
                                    ${fila.candidatos[c]}
                                </td>`).join("")}
                            <td class="mono" style="text-align:center;font-weight:700;">${fila.total}</td>
                        </tr>`;
                    }).join("")}
                </tbody>
            </table>
        </div>
        <p class="texto-suave" style="font-size:.78rem;margin-top:.6rem;">Celdas resaltadas: candidato con más votos en ese sector. Usa el filtro superior para ver un sector en detalle.</p>`;
}

// Perfil demográfico de los encuestados
function renderPerfil(datos) {
    const cont = document.getElementById("perfil-demo");
    const desc = document.getElementById("perfil-descripcion");

    if (datos.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">🧑‍🤝‍🧑</div>Sin datos para este perfil.</div>';
        return;
    }

    desc.textContent = `Basado en ${datos.length} encuesta${datos.length > 1 ? "s" : ""}.`;

    const conteoPor = (campo, opciones) => {
        const c = {};
        opciones.forEach((o) => (c[o] = 0));
        datos.forEach((e) => {
            const v = e[campo];
            if (c[v] !== undefined) c[v]++;
            else if (v) c[v] = (c[v] || 0) + 1;
        });
        return c;
    };

    const n = datos.length;
    const grupos = [
        {
            titulo: "Sexo",
            color: "#0f766e",
            etiquetas: ["Hombre", "Mujer"],
            mapa: conteoPor("sexo", ["Hombre", "Mujer"])
        },
        {
            titulo: "Grupo etario",
            color: "#c2410c",
            etiquetas: ["18-24", "25-39", "40-54", "55+"],
            mapa: conteoPor("grupoEtario", ["18 - 24 años", "25 - 39 años", "40 - 54 años", "55 a más"])
        },
        {
            titulo: "Decisión de voto",
            color: "#7c3aed",
            etiquetas: ["Totalmente decidido", "Podría cambiar", "Aún no decide"],
            mapa: conteoPor("decision", ["Totalmente decidido", "Podría cambiar de opinión", "Aún no lo ha decidido"])
        }
    ];

    cont.innerHTML = `
        <div class="grid grid-3">
            ${grupos.map((g) => {
                const valores = g.etiquetas.map((et, i) => g.mapa[g.etiquetas[i]] || 0);
                const max = Math.max(...valores, 1);
                return `
                <div>
                    <p style="font-weight:700;margin-bottom:.6rem;">${escaparHTML(g.titulo)}</p>
                    ${valores.map((v, i) => `
                        <div class="barra-item">
                            <div class="barra-cabeza">
                                <span class="barra-nombre">${escaparHTML(g.etiquetas[i])}</span>
                                <span class="barra-valor">${v} · ${Math.round((v / n) * 100)}%</span>
                            </div>
                            <div class="barra-fondo">
                                <div class="barra-llena" style="width:${Math.round((v / max) * 100)}%;background:${g.color};"></div>
                            </div>
                        </div>`).join("")}
                </div>`;
            }).join("")}
        </div>`;
}

function renderTablaEncuestador(datos, total) {
    const cont = document.getElementById("tabla-encuestador");
    const porEncuestador = new Map();
    datos.forEach((e) => {
        const u = e.encuestador || "Sin asignar";
        porEncuestador.set(u, (porEncuestador.get(u) || 0) + 1);
    });

    const filas = [...porEncuestador.entries()].sort((a, b) => b[1] - a[1]);
    if (filas.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">👥</div>Sin datos.</div>';
        return;
    }

    cont.innerHTML = `
        <div class="tabla-wrap">
            <table class="tabla">
                <thead><tr><th>Encuestador</th><th>Encuestas</th><th>%</th></tr></thead>
                <tbody>
                    ${filas.map(([u, n]) => `
                        <tr>
                            <td>${escaparHTML(u)}</td>
                            <td class="mono">${n}</td>
                            <td class="mono">${total ? Math.round((n / total) * 100) : 0}%</td>
                        </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

document.getElementById("filtro-sector").addEventListener("change", aplicarFiltro);

// ---- Fecha del reporte ----
document.getElementById("reporte-fecha").textContent = new Date().toLocaleDateString("es-PE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
});

// ---- Imprimir reporte ----
document.getElementById("btn-imprimir").addEventListener("click", () => {
    document.getElementById("reporte-fecha").textContent = new Date().toLocaleDateString("es-PE", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
    window.print();
});

// ---- Exportar a Excel (.xlsx) con gráficos e interpretación ----

// ---- Exportar CSV (base actual según el filtro) ----
document.getElementById("btn-exportar-csv").addEventListener("click", () => {
    if (datosActuales.length === 0) {
        mostrarToast("No hay encuestas para exportar.", "error");
        return;
    }
    const sector = document.getElementById("filtro-sector").value;
    const sufijo = new Date().toISOString().slice(0, 10);
    exportarCSV(datosActuales, `encuestas-${sector ? sector.replace(/[^\w]+/g, "-").toLowerCase() : "todas"}-${sufijo}.csv`);
    mostrarToast(`CSV descargado con ${datosActuales.length} encuestas.`, "exito");
});

document.getElementById("btn-exportar").addEventListener("click", async () => {
    if (datosActuales.length === 0) {
        mostrarToast("No hay encuestas para exportar.", "error");
        return;
    }
    try {
        const sector = document.getElementById("filtro-sector").value;
        await exportarReporteExcel(datosActuales, { sectorFiltro: sector });
        mostrarToast(`Excel exportado con ${datosActuales.length} encuestas y gráficos.`, "exito");
    } catch (error) {
        console.error("Error al exportar a Excel:", error);
        mostrarToast("No se pudo exportar el Excel: " + (error && error.message ? error.message : "error desconocido"), "error", 5000);
    }
});

// ---- Importar CSV (papel, Excel, Google Forms) ----
// Las utilidades de parseo vienen de ../csv-import.js

document.getElementById("btn-importar").addEventListener("click", async () => {
    const archivo = document.getElementById("import-archivo").files[0];
    const resultado = document.getElementById("import-resultado");
    resultado.textContent = "";
    if (!archivo) {
        mostrarToast("Selecciona un archivo CSV.", "error");
        return;
    }

    const encuestadorDefault = limpiarTexto(document.getElementById("import-encuestador").value);
    const origen = document.getElementById("import-origen").value;

    let filas;
    try {
        const texto = await archivo.text();
        filas = parsearCSV(texto);
    } catch (error) {
        resultado.innerHTML = `<span style="color:var(--peligro);">No se pudo leer el archivo: ${escaparHTML(error.message)}</span>`;
        return;
    }

    const encabezados = filas[0].map((h) => normalizarClave(h));
    const camposUsados = encabezados.map((c) => c).filter(Boolean);
    if (camposUsados.length === 0) {
        resultado.innerHTML = `<span style="color:var(--peligro);">No se reconocieron las columnas. Revisa la guía de formato del CSV.</span>`;
        return;
    }

    // Validar que exista el candidato en la cartilla o en voto espontáneo
    const registros = [];
    const errores = [];
    const fechaHoy = new Date();

    filas.slice(1).forEach((fila, idx) => {
        const linea = idx + 2;
        const reg = {};
        encabezados.forEach((campo, i) => {
            if (campo) reg[campo] = limpiarTexto(fila[i]);
        });

        if (!reg.candidatoFijo && !reg.votoEspontaneo) {
            errores.push(`Fila ${linea}: falta el candidato (columna "candidato" o "voto espontáneo").`);
            return;
        }
        const candidato = reg.candidatoFijo;
        if (candidato && !CANDIDATOS.includes(candidato)) {
            errores.push(`Fila ${linea}: candidato "${candidato}" no está en la cartilla.`);
            return;
        }

        const fecha = normalizarFecha(reg.fecha);
        const fechaDoc = fecha || fechaHoy;
        const id = reg.id || `csv-${origen.replace(/\s+/g, "-").toLowerCase()}-${linea}-${fechaDoc.getTime()}`;

        registros.push({
            id: String(id),
            sector: reg.sector || "Sin sector",
            sexo: reg.sexo || "Sin dato",
            grupoEtario: reg.grupoEtario || "Sin dato",
            candidatoFijo: candidato || "Indeciso / No sabe / No precisa",
            votoEspontaneo: reg.votoEspontaneo || "",
            decision: reg.decision || "Sin dato",
            prioridad: reg.prioridad || "Sin dato",
            cualidad: reg.cualidad || "Sin dato",
            encuestador: reg.encuestador || encuestadorDefault || "Sin asignar",
            fecha: fecha ? aFecha(fecha) : null,
            origen
        });
    });

    if (registros.length === 0) {
        resultado.innerHTML = `<span style="color:var(--peligro);">No hay filas válidas para importar.${errores.length ? " " + errores[0] : ""}</span>`;
        return;
    }

    const boton = document.getElementById("btn-importar");
    boton.disabled = true;
    boton.textContent = "Importando...";
    try {
        let insertadas = 0;
        for (const reg of registros) {
            const ref = doc(collection(db, "encuestas"), reg.id);
            const existente = await getDoc(ref);
            if (existente.exists()) continue;
            await setDoc(ref, reg);
            insertadas++;
        }
        const duplicadas = registros.length - insertadas;
        resultado.innerHTML = insertadas > 0
            ? `<span style="color:var(--exito);">✓ ${insertadas} encuesta${insertadas > 1 ? "s" : ""} importada${insertadas > 1 ? "s" : ""}.</span>`
            : `<span style="color:var(--peligro);">Todo ya existía (${duplicadas} duplicada${duplicadas > 1 ? "s" : ""}).</span>`;
        if (insertadas > 0) {
            if (errores.length) {
                resultado.innerHTML += `<br><span style="color:var(--peligro);">${errores.length} fila(s) omitida(s).</span>`;
            }
            cargarDatos();
        }
    } catch (error) {
        console.error("Error al importar CSV:", error);
        resultado.innerHTML = `<span style="color:var(--peligro);">Error al importar: ${escaparHTML(error.message)}</span>`;
    } finally {
        boton.disabled = false;
        boton.textContent = "⬆️ Importar CSV";
    }
});

cargarDatos();
