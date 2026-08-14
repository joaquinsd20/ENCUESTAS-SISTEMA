import { db } from "../firebase-config.js";
import { collection, getDocs, getDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { escaparHTML, mostrarToast, aFecha } from "../ui.js";
import { CANDIDATOS, CANDIDATOS_CORTOS } from "../candidatos.js";
import { normalizarClave, parsearCSV, normalizarFecha, limpiarTexto } from "../csv-import.js";

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
    renderTablaEncuestador(datos, total);
    renderPerfil(datos);
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

function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
}

// Renderiza un gráfico fuera de pantalla y devuelve su imagen PNG
function renderImagenChart(config) {
    const contenedor = document.createElement("div");
    contenedor.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:500px;z-index:-1;";
    const lienzo = document.createElement("canvas");
    lienzo.width = 900;
    lienzo.height = 500;
    contenedor.appendChild(lienzo);
    document.body.appendChild(contenedor);
    const grafico = new Chart(lienzo.getContext("2d"), {
        ...config,
        options: { ...(config.options || {}), responsive: false, maintainAspectRatio: false }
    });
    const dataURL = lienzo.toDataURL("image/png");
    grafico.destroy();
    document.body.removeChild(contenedor);
    return dataURL;
}

document.getElementById("btn-exportar").addEventListener("click", async () => {
    if (typeof ExcelJS === "undefined") {
        mostrarToast("La librería de Excel aún no terminó de cargar. Reintenta en un momento.", "error");
        return;
    }
    const datos = datosActuales;
    if (datos.length === 0) {
        mostrarToast("No hay encuestas para exportar.", "error");
        return;
    }

    try {
    const total = datos.length;

    const conteo = {};
    CANDIDATOS.forEach((c) => (conteo[c] = 0));
    datos.forEach((e) => {
        if (conteo[e.candidatoFijo] !== undefined) conteo[e.candidatoFijo]++;
        else conteo["Indeciso / No sabe / No precisa"]++;
    });

    const definidos = total - conteo["Indeciso / No sabe / No precisa"] - conteo["Blanco / Nulo / Viciado"];
    const lider = CANDIDATOS.reduce((a, b) => (conteo[a] >= conteo[b] ? a : b), CANDIDATOS[0]);

    const ranking = CANDIDATOS
        .map((c) => ({
            nombre: c,
            votos: conteo[c],
            pctTot: total ? conteo[c] / total : 0,
            pctDef: definidos ? conteo[c] / definidos : 0
        }))
        .sort((a, b) => b.votos - a.votos);

    const observacion = (r) => {
        if (r.nombre === "Indeciso / No sabe / No precisa") {
            return r.votos ? "Segmento indeciso — oportunidad para la estrategia" : "Sin registros";
        }
        if (r.nombre === "Blanco / Nulo / Viciado") {
            return r.votos ? "Votos blancos/nulos registrados" : "Sin registros";
        }
        if (r.votos === 0) return "Sin votos registrados";
        if (r.pctDef >= 0.4) return "Líder de la contienda";
        if (r.pctDef >= 0.2) return "Fuerte contendiente";
        if (r.pctDef >= 0.1) return "Fuerza media";
        if (r.pctDef >= 0.05) return "Apoyo en crecimiento";
        return "Apoyo bajo";
    };

    const porSector = new Map();
    datos.forEach((e) => {
        const s = e.sector || "Sin sector";
        if (!porSector.has(s)) {
            const f = { total: 0, candidatos: {} };
            CANDIDATOS.forEach((c) => (f.candidatos[c] = 0));
            porSector.set(s, f);
        }
        const f = porSector.get(s);
        f.total++;
        const c = e.candidatoFijo;
        if (f.candidatos[c] !== undefined) f.candidatos[c]++;
        else f.candidatos["Indeciso / No sabe / No precisa"]++;
    });
    const sectores = [...porSector.entries()].sort((a, b) => b[1].total - a[1].total);

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
    const sexo = conteoPor("sexo", ["Hombre", "Mujer"]);
    const edad = conteoPor("grupoEtario", ["18 - 24 años", "25 - 39 años", "40 - 54 años", "55 a más"]);
    const decision = conteoPor("decision", ["Totalmente decidido", "Podría cambiar de opinión", "Aún no lo ha decidido"]);

    const porEncuestador = new Map();
    datos.forEach((e) => {
        const u = e.encuestador || "Sin asignar";
        porEncuestador.set(u, (porEncuestador.get(u) || 0) + 1);
    });

    const prioridades = new Map();
    const cualidades = new Map();
    const espontaneo = new Map();
    datos.forEach((e) => {
        if (e.prioridad) prioridades.set(e.prioridad, (prioridades.get(e.prioridad) || 0) + 1);
        if (e.cualidad) cualidades.set(e.cualidad, (cualidades.get(e.cualidad) || 0) + 1);
        if (e.votoEspontaneo) {
            const k = String(e.votoEspontaneo).trim();
            if (k) espontaneo.set(k, (espontaneo.get(k) || 0) + 1);
        }
    });

    const pctIndeciso = conteo["Indeciso / No sabe / No precisa"] / total;
    const pctBlanco = conteo["Blanco / Nulo / Viciado"] / total;
    const sectorFiltro = document.getElementById("filtro-sector").value;
    const notaFiltro = sectorFiltro
        ? `Se aplicó el filtro de sector: "${sectorFiltro}".`
        : "Sin filtro: se incluyen todos los sectores.";
    const fechaReporte = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

    // Imágenes de los gráficos
    const imgTorta = renderImagenChart({
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
                title: { display: true, text: "Intención de voto por candidato", font: { size: 18 } },
                legend: { position: "bottom", labels: { font: { size: 12 } } },
                tooltip: { enabled: false }
            }
        }
    });

    const imgBarras = renderImagenChart({
        type: "bar",
        data: {
            labels: ranking.map((r) => CANDIDATOS_CORTOS[r.nombre]),
            datasets: [{
                label: "Votos",
                data: ranking.map((r) => r.votos),
                backgroundColor: COLORES,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                title: { display: true, text: "Ranking de candidatos", font: { size: 18 } },
                legend: { display: false }
            },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "El Porvenir Opina";
    wb.created = new Date();

    const COLOR_PRIMARIO = "FF0F766E";
    const COLOR_OSCURO = "FF134E4A";
    const COLOR_CLARO = "FFCCFBF1";
    const COLOR_CABECERA = "FFE7E5DF";

    const pintar = (ws, ref, valor, { bold = false, size, color, fill, numFmt, alinear } = {}) => {
        // ref puede ser una dirección ("B5") o un objeto Cell de exceljs
        const c = typeof ref === "string" ? ws.getCell(ref) : ref;
        if (!c) return;
        c.value = valor;
        c.font = { bold, ...(size ? { size } : {}), ...(color ? { color: { argb: color } } : {}) };
        if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        if (numFmt) c.numFmt = numFmt;
        c.alignment = { vertical: "middle", wrapText: true, horizontal: alinear || "left" };
        return c;
    };

    // ================= HOJA RESUMEN =================
    const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 70;

    ws.mergeCells("A1:D1");
    pintar(ws, "A1", "EL PORVENIR OPINA — REPORTE DE INTENCIÓN DE VOTO", { bold: true, size: 16, color: "#FFFFFF", fill: COLOR_OSCURO });
    ws.getRow(1).height = 26;

    ws.mergeCells("A2:D2");
    pintar(ws, "A2", `Fecha del reporte: ${fechaReporte}  ·  ${notaFiltro}`, { color: "FF78716C" });
    ws.getRow(2).height = 18;

    ws.mergeCells("A4:D4");
    pintar(ws, "A4", "RESUMEN EJECUTIVO", { bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO });

    const kpis = [
        ["Encuestas analizadas", total, null, null],
        ["Voto definido", null, definidos / total, "0.0%"],
        ["Indecisos / NS / NC", null, pctIndeciso, "0.0%"],
        ["Blanco / Nulo / Viciado", null, pctBlanco, "0.0%"],
        ["Candidato líder", null, null, null],
        ["Votos del candidato líder", null, null, null]
    ];
    pintar(ws, "A5", kpis[0][0], { bold: true });
    pintar(ws, "B5", kpis[0][1], { bold: true, alinear: "center" });
    pintar(ws, "A6", kpis[1][0]);
    pintar(ws, "B6", kpis[1][2], { numFmt: kpis[1][3], alinear: "center" });
    pintar(ws, "A7", kpis[2][0]);
    pintar(ws, "B7", kpis[2][2], { numFmt: kpis[2][3], alinear: "center" });
    pintar(ws, "A8", kpis[3][0]);
    pintar(ws, "B8", kpis[3][2], { numFmt: kpis[3][3], alinear: "center" });
    pintar(ws, "A9", kpis[4][0], { bold: true, color: COLOR_PRIMARIO });
    pintar(ws, "B9", CANDIDATOS_CORTOS[lider] || lider, { bold: true, color: COLOR_PRIMARIO, alinear: "center" });
    pintar(ws, "A10", kpis[5][0]);
    pintar(ws, "B10", conteo[lider], { alinear: "center" });

    ws.mergeCells("A12:D12");
    pintar(ws, "A12", "LECTURA INTERPRETATIVA", { bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO });

    const parrafos = [
        `1) Se procesaron ${total} encuesta${total > 1 ? "s" : ""}. ${notaFiltro} El candidato con mayor intención de voto es ${CANDIDATOS_CORTOS[lider] || lider} con ${conteo[lider]} voto${conteo[lider] > 1 ? "s" : ""} (${Math.round((conteo[lider] / total) * 100)}% del total).`,
        `2) El ${Math.round(pctIndeciso * 100)}% de los encuestados se declara indeciso o no precisa voto. Es el segmento más grande de votos por conquistar: si se convierte el 50% de ese grupo, el líder actual ${CANDIDATOS_CORTOS[lider] || lider} mantendría su ventaja si retiene su base.`,
        `3) Excluyendo indecisos y blancos/nulos (${definidos} voto${definidos > 1 ? "s" : ""} definido${definidos > 1 ? "s" : ""}), la distribución del voto definido favorece claramente a ${CANDIDATOS_CORTOS[lider] || lider} con ${Math.round((conteo[lider] / definidos) * 100)}%.`,
        `4) El sector con mayor cobertura es "${sectores[0][0]}" con ${sectores[0][1].total} encuestas. Revisa la hoja "Datos por sector" para comparar el rendimiento de cada candidato por zona.`,
        `5) En la hoja "Perfil demográfico" se detalla la composición por sexo, grupo etario y nivel de decisión, útil para segmentar la estrategia de campo.`
    ];
    parrafos.forEach((t, i) => {
        const fila = 13 + i;
        ws.mergeCells(`A${fila}:D${fila}`);
        pintar(ws, `A${fila}`, t, {});
        ws.getRow(fila).height = 30;
    });

    // Gráficos incrustados en la hoja Resumen
    const anclaTorta = 20;
    ws.addImage(wb.addImage({ base64: imgTorta.split(",")[1], extension: "png" }), {
        tl: { col: 0, row: anclaTorta }, ext: { width: 620, height: 430 }
    });
    ws.addImage(wb.addImage({ base64: imgBarras.split(",")[1], extension: "png" }), {


        tl: { col: 6, row: anclaTorta }, ext: { width: 620, height: 430 }
    });

    // ================= HOJA RESULTADOS =================
    const wsRes = wb.addWorksheet("Resultados", { views: [{ state: "frozen", ySplit: 1 }] });
    wsRes.columns = [
        { width: 32 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 26 }
    ];
    const encRes = ["Candidato", "Votos", "% del total", "% votos definidos", "Posición", "Observación"];
    encRes.forEach((h, i) => pintar(wsRes, wsRes.getRow(1).getCell(i + 1), h, {
        bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center"
    }));
    ranking.forEach((r, i) => {
        const fila = i + 2;
        const liderFila = r.nombre === lider;
        const lleno = liderFila ? COLOR_CLARO : undefined;
        pintar(wsRes, `A${fila}`, r.nombre, { bold: liderFila, fill: lleno });
        pintar(wsRes, `B${fila}`, r.votos, { fill: lleno, alinear: "center" });
        pintar(wsRes, `C${fila}`, r.pctTot, { numFmt: "0.0%", fill: lleno, alinear: "center" });
        pintar(wsRes, `D${fila}`, r.pctDef, { numFmt: "0.0%", fill: lleno, alinear: "center" });
        pintar(wsRes, `E${fila}`, i + 1, { fill: lleno, alinear: "center" });
        pintar(wsRes, `F${fila}`, observacion(r), { fill: lleno });
    });
    const filaTot = ranking.length + 2;
    pintar(wsRes, `A${filaTot}`, "TOTAL", { bold: true, fill: COLOR_CABECERA });
    pintar(wsRes, `B${filaTot}`, total, { bold: true, fill: COLOR_CABECERA, alinear: "center" });

    // ================= HOJA DATOS POR SECTOR =================
    const wsSec = wb.addWorksheet("Datos por sector", { views: [{ state: "frozen", ySplit: 1 }] });
    wsSec.getColumn(1).width = 24;
    CANDIDATOS.forEach((c, i) => (wsSec.getColumn(i + 2).width = 13));
    wsSec.getColumn(CANDIDATOS.length + 2).width = 9;
    wsSec.getColumn(CANDIDATOS.length + 3).width = 12;

    pintar(wsSec, "A1", "Sector", { bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center" });
    CANDIDATOS.forEach((c, i) => pintar(wsSec, wsSec.getRow(1).getCell(i + 2), CANDIDATOS_CORTOS[c], {
        bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center"
    }));
    pintar(wsSec, wsSec.getRow(1).getCell(CANDIDATOS.length + 2), "Total", { bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center" });
    pintar(wsSec, wsSec.getRow(1).getCell(CANDIDATOS.length + 3), "% del total", { bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center" });

    sectores.forEach(([sector, f], i) => {
        const fila = i + 2;
        pintar(wsSec, `A${fila}`, sector, { bold: true });
        const maxVotos = Math.max(...CANDIDATOS.map((c) => f.candidatos[c]));
        CANDIDATOS.forEach((c, j) => {
            const ganador = f.candidatos[c] === maxVotos && maxVotos > 0;
            pintar(wsSec, wsSec.getRow(fila).getCell(j + 2), f.candidatos[c], {
                alinear: "center", bold: ganador, fill: ganador ? COLOR_CLARO : undefined,
                color: ganador ? COLOR_PRIMARIO : undefined
            });
        });
        pintar(wsSec, wsSec.getRow(fila).getCell(CANDIDATOS.length + 2), f.total, { bold: true, alinear: "center" });
        pintar(wsSec, wsSec.getRow(fila).getCell(CANDIDATOS.length + 3), f.total / total, { numFmt: "0.0%", alinear: "center" });
    });

    // ================= HOJA PERFIL DEMOGRÁFICO =================
    const wsPer = wb.addWorksheet("Perfil demográfico");
    wsPer.getColumn(1).width = 26;
    wsPer.getColumn(2).width = 10;
    wsPer.getColumn(3).width = 12;
    wsPer.getColumn(5).width = 26;
    wsPer.getColumn(6).width = 10;
    wsPer.getColumn(7).width = 12;

    const tablaPerfil = (ws, inicio, titulo, mapa, etiquetas) => {
        const r = ws.getRow(inicio);
        pintar(ws, `A${inicio}`, titulo, { bold: true, color: "#FFFFFF", fill: COLOR_OSCURO });
        ws.mergeCells(inicio, 1, inicio, 3);
        const h = inicio + 1;
        ["Categoría", "N", "%"].forEach((t, i) => pintar(ws, ws.getRow(h).getCell(i + 1), t, { bold: true, fill: COLOR_CABECERA, alinear: "center" }));
        etiquetas.forEach((et, i) => {
            const fila = h + 1 + i;
            pintar(ws, `A${fila}`, et);
            pintar(ws, `B${fila}`, mapa[et] || 0, { alinear: "center" });
            pintar(ws, `C${fila}`, (mapa[et] || 0) / total, { numFmt: "0.0%", alinear: "center" });
        });
        return h + etiquetas.length + 2;
    };

    let filaPer = 1;
    filaPer = tablaPerfil(wsPer, filaPer, "Sexo", sexo, ["Hombre", "Mujer"]);
    filaPer = tablaPerfil(wsPer, filaPer, "Grupo etario", edad, ["18 - 24 años", "25 - 39 años", "40 - 54 años", "55 a más"]);
    filaPer = tablaPerfil(wsPer, filaPer, "Decisión de voto", decision, ["Totalmente decidido", "Podría cambiar de opinión", "Aún no lo ha decidido"]);

    // ================= HOJA ENCUESTADORES =================
    const wsEnc = wb.addWorksheet("Encuestadores", { views: [{ state: "frozen", ySplit: 1 }] });
    wsEnc.getColumn(1).width = 30;
    wsEnc.getColumn(2).width = 10;
    wsEnc.getColumn(3).width = 12;
    ["Encuestador", "Encuestas", "% del total"].forEach((h, i) => pintar(wsEnc, wsEnc.getRow(1).getCell(i + 1), h, {
        bold: true, color: "#FFFFFF", fill: COLOR_PRIMARIO, alinear: "center"
    }));
    [...porEncuestador.entries()].sort((a, b) => b[1] - a[1]).forEach(([u, n], i) => {
        const fila = i + 2;
        pintar(wsEnc, `A${fila}`, u);
        pintar(wsEnc, `B${fila}`, n, { alinear: "center" });
        pintar(wsEnc, `C${fila}`, n / total, { numFmt: "0.0%", alinear: "center" });
    });

    // ================= HOJA TEMAS Y VOTO ESPONTÁNEO =================
    const wsTem = wb.addWorksheet("Temas y voto espontáneo");
    wsTem.getColumn(1).width = 42;
    wsTem.getColumn(2).width = 10;
    wsTem.getColumn(3).width = 12;
    wsTem.getColumn(5).width = 42;
    wsTem.getColumn(6).width = 10;
    wsTem.getColumn(7).width = 12;

    const tablaTemas = (ws, inicio, titulo, mapa) => {
        const r = ws.getRow(inicio);
        pintar(ws, `A${inicio}`, titulo, { bold: true, color: "#FFFFFF", fill: COLOR_OSCURO });
        ws.mergeCells(inicio, 1, inicio, 3);
        const orden = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
        orden.forEach(([k, n], i) => {
            const fila = inicio + 1 + i;
            pintar(ws, `A${fila}`, k);
            pintar(ws, `B${fila}`, n, { alinear: "center" });
            pintar(ws, `C${fila}`, n / total, { numFmt: "0.0%", alinear: "center" });
        });
        return inicio + orden.length + 2;
    };

    let filaTem = 1;
    filaTem = tablaTemas(wsTem, filaTem, "Prioridades (problemas que más mencionan)", prioridades);
    filaTem = tablaTemas(wsTem, filaTem, "Cualidades más valoradas", cualidades);
    filaTem = tablaTemas(wsTem, filaTem, "Voto espontáneo (menciones abiertas)", new Map([...espontaneo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)));

    // Generar el archivo y descargarlo
    const buffer = await wb.xlsx.writeBuffer();
    descargarBlob(new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }), `reporte-intencion-voto-el-porvenir-${new Date().toISOString().slice(0, 10)}.xlsx`);
    mostrarToast(`Excel exportado con ${total} encuestas y gráficos.`, "exito");
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
