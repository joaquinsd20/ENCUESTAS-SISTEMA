import { db } from "../firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { aFecha, esMismoDia, escaparHTML, mostrarToast } from "../ui.js";
import { CANDIDATOS, CANDIDATOS_CORTOS } from "../candidatos.js";

const usuario = await protegerSesion("../index.html");
const correoEncuestador = usuario.email;

document.getElementById("btn-salir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
});

const COLORES = ["#0f766e", "#c2410c", "#b45309", "#7c3aed", "#dc2626", "#0891b2", "#94a3b8", "#f59e0b"];

let graficoTorta = null;
let graficoZonas = null;

async function cargarDatos() {
    try {
        const q = query(collection(db, "encuestas"), where("encuestador", "==", correoEncuestador));
        const snap = await getDocs(q);

        const encuestas = [];
        snap.forEach((doc) => encuestas.push(doc.data()));
        const total = encuestas.length;

        let hoy = 0;
        const porCandidato = {};
        const porSector = new Map();
        CANDIDATOS.forEach((c) => (porCandidato[c] = 0));

        encuestas.forEach((e) => {
            const fecha = aFecha(e.fecha);
            if (fecha && esMismoDia(fecha)) hoy++;
            if (porCandidato[e.candidatoFijo] !== undefined) porCandidato[e.candidatoFijo]++;
            const s = e.sector || "Sin sector";
            porSector.set(s, (porSector.get(s) || 0) + 1);
        });

        // Meta
        let meta = 0;
        try {
            const snapMeta = await getDoc(doc(db, "usuarios", usuario.uid));
            meta = (snapMeta.exists() && snapMeta.data().metaDiaria) || 0;
        } catch (error) {
            console.error("Error al leer la meta:", error);
        }

        document.getElementById("est-hoy").textContent = hoy;
        document.getElementById("est-total").textContent = total;
        document.getElementById("est-meta").textContent = meta > 0
            ? `${Math.min(100, Math.round((hoy / meta) * 100))}%`
            : "—";
        if (meta > 0 && hoy >= meta) {
            document.getElementById("est-meta").textContent = "¡Cumplida! 🎉";
        }

        renderTorta(porCandidato, total);
        renderZonas(porSector);
        renderPerfil(encuestas);
        renderRanking(encuestas);
    } catch (error) {
        console.error("Error al cargar estadísticas:", error);
        mostrarToast("No se pudieron cargar tus estadísticas.", "error");
    }
}

function renderTorta(porCandidato, total) {
    const ctx = document.getElementById("grafico-torta").getContext("2d");
    if (graficoTorta) graficoTorta.destroy();

    const datos = CANDIDATOS.map((c) => porCandidato[c]);
    graficoTorta = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: CANDIDATOS.map((c) => CANDIDATOS_CORTOS[c]),
            datasets: [{
                data: datos,
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
}

function renderZonas(porSector) {
    const ctx = document.getElementById("grafico-zonas").getContext("2d");
    if (graficoZonas) graficoZonas.destroy();

    const orden = [...porSector.entries()].sort((a, b) => b[1] - a[1]);
    graficoZonas = new Chart(ctx, {
        type: "bar",
        data: {
            labels: orden.map(([z]) => z),
            datasets: [{
                label: "Encuestas",
                data: orden.map(([, n]) => n),
                backgroundColor: "#0f766e",
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

function barrasGrupo(etiquetas, datos, color) {
    const total = datos.reduce((a, b) => a + b, 0);
    const max = Math.max(...datos, 1);
    return etiquetas.map((et, i) => `
        <div class="barra-item">
            <div class="barra-cabeza">
                <span class="barra-nombre">${escaparHTML(et)}</span>
                <span class="barra-valor">${datos[i]}${total ? " · " + Math.round((datos[i] / total) * 100) + "%" : ""}</span>
            </div>
            <div class="barra-fondo">
                <div class="barra-llena" style="width:${Math.round((datos[i] / max) * 100)}%;background:${color};"></div>
            </div>
        </div>`).join("");
}

function conteoPor(encuestas, campo, opciones) {
    const conteo = {};
    opciones.forEach((o) => (conteo[o] = 0));
    encuestas.forEach((e) => {
        const v = e[campo];
        if (conteo[v] !== undefined) conteo[v]++;
        else if (v) conteo[v] = (conteo[v] || 0) + 1;
    });
    return conteo;
}

function renderPerfil(encuestas) {
    const cont = document.getElementById("perfil-demo");
    if (encuestas.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">📊</div>Aún no tienes datos.</div>';
        return;
    }

    const sexo = conteoPor(encuestas, "sexo", ["Hombre", "Mujer"]);
    const edad = conteoPor(encuestas, "grupoEtario", ["18 - 24 años", "25 - 39 años", "40 - 54 años", "55 a más"]);
    const decision = conteoPor(encuestas, "decision", ["Totalmente decidido", "Podría cambiar de opinión", "Aún no lo ha decidido"]);

    cont.innerHTML = `
        <p style="font-weight:700;margin-bottom:.6rem;">Sexo</p>
        ${barrasGrupo(["Hombre", "Mujer"], [sexo["Hombre"], sexo["Mujer"]], "#0f766e")}
        <p style="font-weight:700;margin:1rem 0 .6rem;">Grupo etario</p>
        ${barrasGrupo(["18-24", "25-39", "40-54", "55+"], [edad["18 - 24 años"], edad["25 - 39 años"], edad["40 - 54 años"], edad["55 a más"]], "#c2410c")}
        <p style="font-weight:700;margin:1rem 0 .6rem;">Decisión de voto</p>
        ${barrasGrupo(
            ["Totalmente decidido", "Podría cambiar", "Aún no decide"],
            [decision["Totalmente decidido"], decision["Podría cambiar de opinión"], decision["Aún no lo ha decidido"]],
            "#7c3aed"
        )}`;
}

function renderRanking(encuestas) {
    const cont = document.getElementById("ranking-temas");
    if (encuestas.length === 0) {
        cont.innerHTML = '<div class="vacio"><div class="icono">📌</div>Aún no tienes datos.</div>';
        return;
    }

    const prioridad = conteoPor(encuestas, "prioridad", []);
    const cualidad = conteoPor(encuestas, "cualidad", []);

    const rankPrioridad = Object.entries(prioridad).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const rankCualidad = Object.entries(cualidad).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxP = rankPrioridad[0] ? rankPrioridad[0][1] : 1;
    const maxC = rankCualidad[0] ? rankCualidad[0][1] : 1;

    cont.innerHTML = `
        <p style="font-weight:700;margin-bottom:.6rem;">Prioridades que mencionan</p>
        ${rankPrioridad.map(([t, n]) => `
            <div class="barra-item">
                <div class="barra-cabeza">
                    <span class="barra-nombre">${escaparHTML(t)}</span>
                    <span class="barra-valor">${n}</span>
                </div>
                <div class="barra-fondo">
                    <div class="barra-llena" style="width:${Math.round((n / maxP) * 100)}%;background:#b45309;"></div>
                </div>
            </div>`).join("")}
        <p style="font-weight:700;margin:1rem 0 .6rem;">Cualidades más valoradas</p>
        ${rankCualidad.map(([t, n]) => `
            <div class="barra-item">
                <div class="barra-cabeza">
                    <span class="barra-nombre">${escaparHTML(t)}</span>
                    <span class="barra-valor">${n}</span>
                </div>
                <div class="barra-fondo">
                    <div class="barra-llena" style="width:${Math.round((n / maxC) * 100)}%;background:#0891b2;"></div>
                </div>
            </div>`).join("")}`;
}

cargarDatos();
