import { db } from "../firebase-config.js";
import {
    collection, addDoc, getDocs, query, where, updateDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { protegerSesion, cerrarSesion } from "../guard.js";
import { mostrarToast, aFecha, esMismoDia, formatoFecha, escaparHTML } from "../ui.js";
import { CANDIDATOS, CANDIDATOS_CORTOS, CANDIDATOS_PARTIDO, CANDIDATOS_SLUG, CANDIDATOS_EXT, PARTIDOS, PARTIDOS_SLUG } from "../candidatos.js";

// ---- Protección de ruta: exige sesión iniciada ----
const usuario = await protegerSesion("../index.html");
const correoEncuestador = usuario.email;

// ---- Cierre de sesión ----
document.getElementById("btn-salir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
});

// ---- Campo condicional "Otro sector" ----
const selectSector = document.getElementById("sector");
const grupoOtro = document.getElementById("grupo-otro-sector");
const inputOtro = document.getElementById("otroSector");

selectSector.addEventListener("change", () => {
    const esOtro = selectSector.value === "Otro";
    grupoOtro.style.display = esOtro ? "block" : "none";
    inputOtro.required = esOtro;
    if (!esOtro) inputOtro.value = "";
});

// ---- Modo edición (?editar=idEncuesta) ----
const urlParams = new URLSearchParams(window.location.search);
const idEdicion = urlParams.get("editar");
const avisoEdicion = document.getElementById("aviso-edicion");
const btnGuardar = document.querySelector(".btn-verde");

function activarModoEdicion() {
    document.getElementById("titulo-texto").textContent = "Editando encuesta";
    btnGuardar.textContent = "Actualizar Encuesta";
    avisoEdicion.style.display = "flex";
    document.getElementById("cancelar-edicion").addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = "nueva-encuesta.html";
    });
}

// ---- Cartilla de candidatos con fotos ----
function construirCartilla() {
    const cont = document.getElementById("cartilla");
    if (!cont) return;

    cont.innerHTML = CANDIDATOS.map((c, idx) => {
        const slug = CANDIDATOS_SLUG[c];
        const ext = CANDIDATOS_EXT[c] || "png";
        const ruta = slug ? `../assets/candidatos/${slug}.${ext}` : "";
        const rutaJpg = slug ? `../assets/candidatos/${slug}.jpg` : "";
        const rutaPng = slug ? `../assets/candidatos/${slug}.png` : "";
        const inicial = (CANDIDATOS_CORTOS[c] || c).slice(0, 1);
        return `
        <label class="candidato-tarjeta" data-valor="${escaparHTML(c)}">
            <input type="radio" name="candidatoFijo" value="${escaparHTML(c)}" class="candidato-radio" ${idx === 0 ? "required" : ""}>
            <span class="candidato-foto">
                ${ruta ? `<img src="${ruta}" alt="${escaparHTML(c)}" loading="lazy" data-jpg="${rutaJpg}" data-png="${rutaPng}">` : ""}
                <span class="candidato-avatar">${escaparHTML(inicial)}</span>
            </span>
            <span class="candidato-nombre">${escaparHTML(c)}</span>
        </label>`;
    }).join("");

    // Si la foto principal falla, intenta con la otra extensión; si también
    // falla, deja el avatar visible.
    cont.querySelectorAll("img").forEach((img) => {
        img.dataset.intento = img.src.endsWith(".jpg") ? "jpg" : "png";
        img.addEventListener("error", () => {
            if (img.dataset.intento === "jpg" && img.dataset.png) {
                img.dataset.intento = "png";
                img.src = img.dataset.png;
            } else if (img.dataset.intento === "png" && img.dataset.jpg) {
                img.dataset.intento = "jpg";
                img.src = img.dataset.jpg;
            } else {
                img.style.display = "none";
            }
        });
    });

    // Resaltar la tarjeta seleccionada (compatible con navegadores sin :has).
    cont.addEventListener("change", (e) => {
        if (!e.target.classList.contains("candidato-radio")) return;
        cont.querySelectorAll(".candidato-tarjeta").forEach((t) => {
            t.classList.toggle("seleccionada", t.querySelector(".candidato-radio").checked);
        });
    });
}

// ---- Cartilla de partidos (Pregunta 3) ----
function construirCartillaPartidos() {
    const cont = document.getElementById("cartilla-partidos");
    if (!cont) return;

    cont.innerHTML = PARTIDOS.map((p, idx) => {
        const slug = PARTIDOS_SLUG[p];
        const inicial = p === "Blanco / Nulo / Viciado" ? "B/N"
            : p === "Indeciso / No sabe / No precisa" ? "?"
            : p.slice(0, 1);
        return `
        <label class="candidato-tarjeta" data-valor="${escaparHTML(p)}">
            <input type="radio" name="partidoFijo" value="${escaparHTML(p)}" class="candidato-radio" ${idx === 0 ? "required" : ""}>
            <span class="candidato-foto">
                ${slug ? `<img src="../assets/partidos/${slug}.png" alt="${escaparHTML(p)}" loading="lazy">` : ""}
                <span class="candidato-avatar">${escaparHTML(inicial)}</span>
            </span>
            <span class="candidato-nombre">${escaparHTML(p)}</span>
        </label>`;
    }).join("");

    cont.addEventListener("change", (e) => {
        if (!e.target.classList.contains("candidato-radio")) return;
        cont.querySelectorAll(".candidato-tarjeta").forEach((t) => {
            t.classList.toggle("seleccionada", t.querySelector(".candidato-radio").checked);
        });
    });
}

construirCartilla();
construirCartillaPartidos();

// ---- Cargar datos de la encuesta en modo edición ----
function rellenarFormulario(data) {
    const sector = data.sector || "";
    if (sector.startsWith("Otro:")) {
        selectSector.value = "Otro";
        inputOtro.value = sector.replace(/^Otro:\s*/, "");
        grupoOtro.style.display = "block";
        inputOtro.required = true;
    } else {
        selectSector.value = sector;
    }
    document.getElementById("sexo").value = data.sexo || "";
    document.getElementById("grupoEtario").value = data.grupoEtario || "";
    document.querySelectorAll('input[name="candidatoFijo"]').forEach((r) => {
        r.checked = (r.value === data.candidatoFijo);
        r.closest(".candidato-tarjeta").classList.toggle("seleccionada", r.checked);
    });
    document.querySelectorAll('input[name="partidoFijo"]').forEach((r) => {
        r.checked = (r.value === data.partidoFijo);
        r.closest(".candidato-tarjeta").classList.toggle("seleccionada", r.checked);
    });
    document.getElementById("decision").value = data.decision || "";
    document.getElementById("prioridad").value = data.prioridad || "";
    document.getElementById("cualidad").value = data.cualidad || "";
}

if (idEdicion) {
    activarModoEdicion();
    getDoc(doc(db, "encuestas", idEdicion))
        .then((snap) => {
            if (snap.exists()) rellenarFormulario(snap.data());
            else mostrarToast("No se encontró la encuesta.", "error");
        })
        .catch(() => mostrarToast("No se pudo cargar la encuesta.", "error"));
}

// ---- Cargar progreso del día y meta ----
async function cargarProgreso() {
    let hoy = 0;
    let total = 0;
    let ultima = null;

    try {
        const q = query(collection(db, "encuestas"), where("encuestador", "==", correoEncuestador));
        const snap = await getDocs(q);
        snap.forEach((doc) => {
            const fecha = aFecha(doc.data().fecha);
            total++;
            if (fecha && esMismoDia(fecha)) hoy++;
            if (fecha && (!ultima || fecha > ultima)) ultima = fecha;
        });
    } catch (error) {
        console.error("Error al cargar el progreso:", error);
    }

    document.getElementById("total-registros").textContent = hoy;
    document.getElementById("total-acumulado").textContent = total;
    document.getElementById("ultima-encuesta").textContent = ultima ? formatoFecha(ultima) : "—";

    // Progreso vs meta diaria
    const metaSpan = document.getElementById("meta-valor");
    const metaBarra = document.getElementById("meta-barra");
    try {
        const snapMeta = await getDoc(doc(db, "usuarios", usuario.uid));
        const meta = (snapMeta.exists() && snapMeta.data().metaDiaria) || 0;
        metaSpan.textContent = `Meta de hoy: ${meta} encuestas`;
        const pct = meta > 0 ? Math.min(100, Math.round((hoy / meta) * 100)) : 0;
        metaBarra.style.width = pct + "%";
        metaBarra.textContent = meta > 0 ? `${hoy} / ${meta}` : "";
        if (meta > 0 && hoy >= meta) {
            metaSpan.textContent += " · ¡Meta cumplida! 🎉";
        }
    } catch (error) {
        console.error("Error al leer la meta:", error);
    }
}

cargarProgreso();

// ---- Guardado de la encuesta ----
document.getElementById("form-encuesta").addEventListener("submit", async (e) => {
    e.preventDefault();

    const sectorElegido = selectSector.value === "Otro"
        ? "Otro: " + inputOtro.value.trim()
        : selectSector.value;

    const datos = {
        sector: sectorElegido,
        sexo: document.getElementById("sexo").value,
        grupoEtario: document.getElementById("grupoEtario").value,
        votoEspontaneo: "",
        candidatoFijo: (document.querySelector('input[name="candidatoFijo"]:checked') || {}).value || "",
        partidoFijo: (document.querySelector('input[name="partidoFijo"]:checked') || {}).value || "",
        decision: document.getElementById("decision").value,
        prioridad: document.getElementById("prioridad").value,
        cualidad: document.getElementById("cualidad").value,
        encuestador: correoEncuestador,
        fecha: new Date()
    };

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    const sinConexion = !navigator.onLine;
    const mensajeExito = sinConexion
        ? "Guardado en tu dispositivo. Se sincronizará al recuperar conexión."
        : "¡Encuesta guardada con éxito!";

    try {
        if (idEdicion) {
            await updateDoc(doc(db, "encuestas", idEdicion), datos);
            mostrarToast(mensajeExito, "exito");
            window.location.href = "mi-progreso.html";
            return;
        }

        await addDoc(collection(db, "encuestas"), datos);
        mostrarToast(mensajeExito, "exito");
        document.getElementById("form-encuesta").reset();
        grupoOtro.style.display = "none";
        reiniciarUbicacion();
        cargarProgreso();
    } catch (error) {
        console.error("Error al guardar:", error);
        mostrarToast("No se pudo guardar la encuesta. Revisa tu conexión.", "error");
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = idEdicion ? "Actualizar Encuesta" : "Guardar Encuesta";
    }
});
