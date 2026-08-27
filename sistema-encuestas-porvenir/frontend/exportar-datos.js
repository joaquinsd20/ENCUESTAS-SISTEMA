import { CANDIDATOS, CANDIDATOS_CORTOS } from "./candidatos.js";

function aTexto(valor) {
    if (valor === null || valor === undefined) return "";
    if (valor && typeof valor.toDate === "function") {
        return valor.toDate().toLocaleString("es-PE");
    }
    if (valor instanceof Date) return valor.toLocaleString("es-PE");
    return String(valor);
}

function limpiarCSV(valor) {
    const texto = aTexto(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

const COLUMNAS = [
    "fecha", "sector", "sexo", "grupoEtario", "candidatoFijo", "partidoFijo",
    "decision", "prioridad", "cualidad", "votoEspontaneo", "encuestador"
];

export function exportarCSV(encuestas, nombreArchivo) {
    const lineas = [COLUMNAS.map(limpiarCSV).join(";")];
    encuestas.forEach((e) => {
        lineas.push(COLUMNAS.map((c) => limpiarCSV(e[c])).join(";"));
    });
    const blob = new Blob(["\uFEFF" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    descargar(blob, nombreArchivo.endsWith(".csv") ? nombreArchivo : nombreArchivo + ".csv");
}

export function exportarExcel(encuestas, nombreArchivo) {
    if (typeof ExcelJS === "undefined") {
        throw new Error("La librería de Excel aún no terminó de cargar. Reintenta en un momento.");
    }
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet("Encuestas");

    hoja.addRow(COLUMNAS).eachCell((celda) => {
        celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    });
    hoja.columns = COLUMNAS.map((c) => ({ key: c, width: 20 }));

    encuestas.forEach((e) => {
        const fila = {};
        COLUMNAS.forEach((c) => (fila[c] = aTexto(e[c])));
        hoja.addRow(fila);
    });

    wb.xlsx.writeBuffer().then((buffer) => {
        descargar(new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }), nombreArchivo.endsWith(".xlsx") ? nombreArchivo : nombreArchivo + ".xlsx");
    });
}

const COLORES = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#94a3b8", "#f59e0b"];

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

export async function exportarReporteExcel(encuestas, { sectorFiltro = "" } = {}) {
    if (typeof ExcelJS === "undefined") {
        throw new Error("La librería de Excel aún no terminó de cargar. Reintenta en un momento.");
    }
    if (encuestas.length === 0) {
        throw new Error("No hay encuestas para exportar.");
    }

    const datos = encuestas;
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
    const notaFiltro = sectorFiltro
        ? `Se aplicó el filtro de sector: "${sectorFiltro}".`
        : "Sin filtro: se incluyen todos los sectores.";
    const fechaReporte = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

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
        const c = typeof ref === "string" ? ws.getCell(ref) : ref;
        if (!c) return;
        c.value = valor;
        c.font = { bold, ...(size ? { size } : {}), ...(color ? { color: { argb: color } } : {}) };
        if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        if (numFmt) c.numFmt = numFmt;
        c.alignment = { vertical: "middle", wrapText: true, horizontal: alinear || "left" };
        return c;
    };

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

    pintar(ws, "A5", "Encuestas analizadas", { bold: true });
    pintar(ws, "B5", total, { bold: true, alinear: "center" });
    pintar(ws, "A6", "Voto definido");
    pintar(ws, "B6", definidos / total, { numFmt: "0.0%", alinear: "center" });
    pintar(ws, "A7", "Indecisos / NS / NC");
    pintar(ws, "B7", pctIndeciso, { numFmt: "0.0%", alinear: "center" });
    pintar(ws, "A8", "Blanco / Nulo / Viciado");
    pintar(ws, "B8", pctBlanco, { numFmt: "0.0%", alinear: "center" });
    pintar(ws, "A9", "Candidato líder", { bold: true, color: COLOR_PRIMARIO });
    pintar(ws, "B9", CANDIDATOS_CORTOS[lider] || lider, { bold: true, color: COLOR_PRIMARIO, alinear: "center" });
    pintar(ws, "A10", "Votos del candidato líder");
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

    const anclaTorta = 20;
    ws.addImage(wb.addImage({ base64: imgTorta.split(",")[1], extension: "png" }), {
        tl: { col: 0, row: anclaTorta }, ext: { width: 620, height: 430 }
    });
    ws.addImage(wb.addImage({ base64: imgBarras.split(",")[1], extension: "png" }), {
        tl: { col: 6, row: anclaTorta }, ext: { width: 620, height: 430 }
    });

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

    const wsPer = wb.addWorksheet("Perfil demográfico");
    wsPer.getColumn(1).width = 26;
    wsPer.getColumn(2).width = 10;
    wsPer.getColumn(3).width = 12;

    const tablaPerfil = (ws, inicio, titulo, mapa, etiquetas) => {
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

    const wsTem = wb.addWorksheet("Temas y voto espontáneo");
    wsTem.getColumn(1).width = 42;
    wsTem.getColumn(2).width = 10;
    wsTem.getColumn(3).width = 12;

    const tablaTemas = (ws, inicio, titulo, mapa) => {
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

    const buffer = await wb.xlsx.writeBuffer();
    descargar(new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }), `reporte-intencion-voto-el-porvenir-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
