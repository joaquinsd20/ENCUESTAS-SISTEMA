import { db } from "../firebase-config.js";
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { aFecha, esMismoDia, escaparHTML, mostrarToast } from "../ui.js";

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

async function cargarDirectorio() {
    const cont = document.getElementById("tabla-directorio");

    try {
        // Cargar usuarios y encuestas en paralelo
        const [snapUsuarios, snapEncuestas] = await Promise.all([
            getDocs(collection(db, "usuarios")),
            getDocs(collection(db, "encuestas"))
        ]);

        const encuestadores = [];
        snapUsuarios.forEach((doc) => {
            const data = doc.data();
            if (data.rol === "encuestador") {
                encuestadores.push({
                    uid: doc.id,
                    correo: data.correo || "sin-correo@",
                    metaDiaria: data.metaDiaria || 0,
                    fechaRegistro: data.fechaRegistro || null
                });
            }
        });

        // Resumen por encuestador (usando el correo como identificador de encuestas)
        const resumen = new Map();
        snapEncuestas.forEach((doc) => {
            const data = doc.data();
            const u = data.encuestador || "Sin asignar";
            if (!resumen.has(u)) {
                resumen.set(u, { total: 0, hoy: 0, sectores: [], ultima: null });
            }
            const r = resumen.get(u);
            r.total++;
            const fecha = aFecha(data.fecha);
            if (fecha) {
                if (esMismoDia(fecha)) r.hoy++;
                if (!r.ultima || fecha > r.ultima) r.ultima = fecha;
            }
            if (data.sector) r.sectores.push(data.sector.replace(/^Otro:\s*/, ""));
        });

        const filas = encuestadores.map((enc) => {
            const r = resumen.get(enc.correo) || { total: 0, hoy: 0, sectores: [], ultima: null };
            const zona = zonaMasFrecuente(r.sectores);
            const activo = r.hoy > 0;
            return {
                correo: enc.correo,
                total: r.total,
                hoy: r.hoy,
                zona,
                ultima: r.ultima,
                activo,
                metaDiaria: enc.metaDiaria,
                uid: enc.uid
            };
        });

        // Ordenar: activos primero, luego por total
        filas.sort((a, b) => (b.activo - a.activo) || (b.total - a.total));

        if (filas.length === 0) {
            cont.innerHTML = '<div class="vacio"><div class="icono">👥</div>Aún no hay encuestadores registrados en el sistema.</div>';
            return;
        }

        cont.innerHTML = `
            <div class="tabla-wrap">
                <table class="tabla">
                    <thead>
                        <tr>
                            <th>Encuestador</th>
                            <th>Zona predominante</th>
                            <th>Meta diaria</th>
                            <th>Encuestas hoy</th>
                            <th>Total encuestas</th>
                            <th>Última actividad</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas.map((f) => `
                            <tr>
                                <td>
                                    <strong>${escaparHTML(f.correo)}</strong>
                                </td>
                                <td>${escaparHTML(f.zona)}</td>
                                <td>
                                    <input type="number" min="0" step="1" class="input-meta"
                                        data-uid="${f.uid}" value="${f.metaDiaria}"
                                        title="Define la meta diaria de encuestas">
                                </td>
                                <td class="mono">${f.hoy}</td>
                                <td class="mono">${f.total}</td>
                                <td class="mono">${f.ultima ? f.ultima.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td>${f.activo ? '<span class="badge badge-verde">● En campo</span>' : '<span class="badge badge-ambar">○ Inactivo</span>'}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        console.error("Error al cargar el directorio:", error);
        mostrarToast("No se pudo cargar el directorio.", "error");
        cont.innerHTML = '<div class="vacio"><div class="icono">⚠️</div>Error al cargar los datos.</div>';
    }
}

// ---- Actualizar la meta diaria de un encuestador ----
document.getElementById("tabla-directorio").addEventListener("change", async (e) => {
    const input = e.target.closest(".input-meta");
    if (!input) return;

    const uid = input.dataset.uid;
    const meta = Math.max(0, parseInt(input.value, 10) || 0);

    try {
        await updateDoc(doc(db, "usuarios", uid), { metaDiaria: meta });
        mostrarToast(`Meta diaria actualizada a ${meta} encuestas.`, "exito");
    } catch (error) {
        console.error("Error al guardar la meta:", error);
        mostrarToast("No se pudo guardar la meta.", "error");
    }
});

function zonaMasFrecuente(sectores) {
    if (!sectores.length) return "Sin datos";
    const conteo = {};
    sectores.forEach((s) => (conteo[s] = (conteo[s] || 0) + 1));
    return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
}

cargarDirectorio();
