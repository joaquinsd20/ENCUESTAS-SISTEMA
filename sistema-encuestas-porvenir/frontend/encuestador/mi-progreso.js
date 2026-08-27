import { db } from "../firebase-config.js";
import {
    collection, getDocs, query, where, deleteDoc, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { aFecha, esMismoDia, escaparHTML, mostrarToast } from "../ui.js";
import { CANDIDATOS, CANDIDATOS_CORTOS } from "../candidatos.js";
import { parsearCSV, normalizarClave, normalizarFecha, limpiarTexto } from "../csv-import.js";

// ---- Protección de ruta ----
const usuario = await protegerSesion("../index.html");
const correoEncuestador = usuario.email;

document.getElementById("btn-salir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
});

// ---- Importar data externa (papel, Excel, Google Forms) ----
document.getElementById("btn-importar").addEventListener("click", async () => {
    const archivo = document.getElementById("import-archivo").files[0];
    const resultado = document.getElementById("import-resultado");
    resultado.textContent = "";
    if (!archivo) {
        mostrarToast("Selecciona un archivo CSV.", "error");
        return;
    }

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
    const camposUsados = encabezados.filter(Boolean);
    if (camposUsados.length === 0) {
        resultado.innerHTML = `<span style="color:var(--peligro);">No se reconocieron las columnas. Revisa la guía del CSV.</span>`;
        return;
    }

    const registros = [];
    const errores = [];
    const fechaHoy = new Date();
    const slugOrigen = origen.replace(/\s+/g, "-").toLowerCase();

    filas.slice(1).forEach((fila, idx) => {
        const linea = idx + 2;
        const reg = {};
        encabezados.forEach((campo, i) => {
            if (campo) reg[campo] = limpiarTexto(fila[i]);
        });

        if (!reg.candidatoFijo && !reg.votoEspontaneo) {
            errores.push(`Fila ${linea}: falta el candidato.`);
            return;
        }
        const candidato = reg.candidatoFijo;
        if (candidato && !CANDIDATOS.includes(candidato)) {
            errores.push(`Fila ${linea}: candidato "${candidato}" no está en la cartilla.`);
            return;
        }

        const fecha = normalizarFecha(reg.fecha);
        const fechaDoc = fecha || fechaHoy;
        const id = reg.id || `csv-${slugOrigen}-${correoEncuestador}-${linea}-${fechaDoc.getTime()}`;

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
            encuestador: correoEncuestador,
            fecha: fecha ? aFecha(fecha) : null,
            origen
        });
    });

    if (registros.length === 0) {
        resultado.innerHTML = `<span style="color:var(--peligro);">No hay filas válidas.${errores.length ? " " + errores[0] : ""}</span>`;
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
            ? `<span style="color:var(--exito);">✓ ${insertadas} encuesta${insertadas > 1 ? "s" : ""} añadida${insertadas > 1 ? "s" : ""} a tu progreso.</span>`
            : `<span style="color:var(--peligro);">Todo ya estaba registrado (${duplicadas} duplicada${duplicadas > 1 ? "s" : ""}).</span>`;
        if (insertadas > 0 && errores.length) {
            resultado.innerHTML += `<br><span style="color:var(--peligro);">${errores.length} fila(s) omitida(s).</span>`;
        }
        if (insertadas > 0) cargarDatos();
    } catch (error) {
        console.error("Error al importar CSV:", error);
        resultado.innerHTML = `<span style="color:var(--peligro);">Error al importar: ${escaparHTML(error.message)}</span>`;
    } finally {
        boton.disabled = false;
        boton.textContent = "⬆️ Subir data externa";
    }
});

async function cargarDatos() {
    const contSector = document.getElementById("por-sector");
    const contRegistros = document.getElementById("lista-registros");

    let hoy = 0;
    let total = 0;
    let metaDiaria = 0;
    const registros = [];
    const sectoresHoy = new Map();
    const todosSectores = new Set();

    try {
        const q = query(collection(db, "encuestas"), where("encuestador", "==", correoEncuestador));
        const snap = await getDocs(q);

        snap.forEach((doc) => {
            const data = doc.data();
            total++;
            const fecha = aFecha(data.fecha);
            todosSectores.add(data.sector || "Sin sector");
            if (fecha && esMismoDia(fecha)) {
                hoy++;
                const s = data.sector || "Sin sector";
                sectoresHoy.set(s, (sectoresHoy.get(s) || 0) + 1);
            }
            registros.push({ id: doc.id, data, fecha });
        });

        const snapMeta = await getDoc(doc(db, "usuarios", usuario.uid));
        metaDiaria = (snapMeta.exists() && snapMeta.data().metaDiaria) || 0;
    } catch (error) {
        console.error("Error al cargar el progreso:", error);
        mostrarToast("No se pudieron cargar tus datos.", "error");
        contSector.innerHTML = '<div class="vacio"><div class="icono">⚠️</div>Error al cargar.</div>';
        contRegistros.innerHTML = "";
        return;
    }

    document.getElementById("contador-hoy").textContent = hoy;
    document.getElementById("total-general").textContent = total;
    document.getElementById("zonas-visitadas").textContent = todosSectores.size;

    // Meta diaria
    const metaValor = document.getElementById("meta-valor");
    const metaBarra = document.getElementById("meta-barra");
    if (metaDiaria > 0) {
        const pct = Math.min(100, Math.round((hoy / metaDiaria) * 100));
        metaBarra.style.width = pct + "%";
        metaBarra.textContent = `${hoy} / ${metaDiaria} · ${pct}%`;
        const falta = Math.max(0, metaDiaria - hoy);
        metaValor.innerHTML = `Meta de hoy: <strong>${metaDiaria} encuestas</strong> · llevas <strong>${hoy}</strong>` +
            (hoy >= metaDiaria
                ? ' <span class="badge badge-verde">¡Meta cumplida! 🎉</span>'
                : ` · te faltan <strong>${falta}</strong> para lograrla`);
    } else {
        metaBarra.style.width = "0%";
        metaValor.innerHTML = "Meta de hoy: <em>no asignada. Tu jefatura puede definirla.</em>";
    }

    // Cobertura por sector hoy
    if (sectoresHoy.size === 0) {
        contSector.innerHTML = '<div class="vacio"><div class="icono">📭</div>Aún no registras encuestas hoy.<br>¡Sal a campo y llena tu primera ficha!</div>';
    } else {
        const max = Math.max(...sectoresHoy.values());
        contSector.innerHTML = [...sectoresHoy.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([sector, n]) => `
                <div class="barra-item">
                    <div class="barra-cabeza">
                        <span class="barra-nombre">${escaparHTML(sector)}</span>
                        <span class="barra-valor">${n}</span>
                    </div>
                    <div class="barra-fondo">
                        <div class="barra-llena" style="width:${Math.round((n / max) * 100)}%;background:var(--acento);"></div>
                    </div>
                </div>`).join("");
    }

    // Últimos registros con acciones de editar/eliminar
    const ultimos = registros.sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, 10);
    if (ultimos.length === 0) {
        contRegistros.innerHTML = '<div class="vacio"><div class="icono">🗒️</div>Todavía no tienes encuestas registradas.</div>';
    } else {
        contRegistros.innerHTML = `
            <div class="tabla-wrap">
                <table class="tabla">
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Sector</th>
                            <th>Intención de voto</th>
                            <th style="text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ultimos.map((r) => `
                            <tr>
                                <td class="mono">${r.fecha ? r.fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td>${escaparHTML(r.data.sector || "—")}</td>
                                <td>${escaparHTML(CANDIDATOS_CORTOS[r.data.candidatoFijo] || r.data.candidatoFijo || "—")}</td>
                                <td style="text-align:right;white-space:nowrap;">
                                    <a href="nueva-encuesta.html?editar=${r.id}" class="btn-accion" title="Editar">✏️</a>
                                    <button class="btn-accion eliminar" data-id="${r.id}" title="Eliminar">🗑️</button>
                                </td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;
    }
}

// ---- Eliminar encuesta ----
document.getElementById("lista-registros").addEventListener("click", async (e) => {
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

cargarDatos();
