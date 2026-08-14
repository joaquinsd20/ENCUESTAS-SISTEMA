// Utilidades para importar encuestas desde archivos CSV
// (papel digitado en Excel, hojas de Google Forms, etc.)

// Normaliza nombres de columnas en español o inglés
export const MAPEO_COLUMNAS = {
    "sector": "sector",
    "zona": "sector",
    "distrito": "sector",
    "sexo": "sexo",
    "género": "sexo",
    "genero": "sexo",
    "grupoetario": "grupoEtario",
    "grupo etario": "grupoEtario",
    "edad": "grupoEtario",
    "candidatofijo": "candidatoFijo",
    "candidato (cartilla)": "candidatoFijo",
    "candidato": "candidatoFijo",
    "candidatocartilla": "candidatoFijo",
    "votospontaneo": "votoEspontaneo",
    "voto espontáneo": "votoEspontaneo",
    "votoespontáneo": "votoEspontaneo",
    "candidatoespontaneo": "votoEspontaneo",
    "decision": "decision",
    "decision de voto": "decision",
    "nivel de decision": "decision",
    "prioridad": "prioridad",
    "problema": "prioridad",
    "principal problema": "prioridad",
    "cualidad": "cualidad",
    "cualidad del candidato": "cualidad",
    "encuestador": "encuestador",
    "entrevistador": "encuestador",
    "fecha": "fecha",
    "date": "fecha",
    "timestamp": "fecha",
    "id": "id",
    "numero": "id"
};

export function normalizarClave(txt) {
    const clave = String(txt || "").trim().toLowerCase();
    return MAPEO_COLUMNAS[clave] || null;
}

export function parsearCSV(texto) {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lineas.length === 0) throw new Error("El archivo está vacío.");
    const filas = lineas.map((l) => {
        const campos = [];
        let cur = "";
        let entreComillas = false;
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (entreComillas) {
                if (ch === '"') {
                    if (l[i + 1] === '"') { cur += '"'; i++; }
                    else entreComillas = false;
                } else cur += ch;
            } else if (ch === '"') {
                entreComillas = true;
            } else if (ch === ",") {
                campos.push(cur); cur = "";
            } else cur += ch;
        }
        campos.push(cur);
        return campos.map((c) => c.trim());
    });
    return filas;
}

export function normalizarFecha(txt) {
    const v = String(txt || "").trim();
    if (!v) return null;
    const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
        const d = new Date(m[3], m[2] - 1, m[1]);
        if (!isNaN(d)) return d;
    }
    const d2 = new Date(v);
    if (!isNaN(d2) && /^\d/.test(v)) return d2;
    return null;
}

export function limpiarTexto(v) {
    const s = String(v == null ? "" : v).trim();
    return s.replace(/\s+/g, " ").slice(0, 300);
}
