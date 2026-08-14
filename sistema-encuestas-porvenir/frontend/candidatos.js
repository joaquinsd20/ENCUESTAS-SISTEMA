// Lista oficial de candidatos de la cartilla de "El Porvenir Opina".
// Se usa en todas las páginas para mantener un único origen de verdad.

export const CANDIDATOS = [
    "Ana Belén Vásquez Aguilar",
    "Sandra Guevara Villalobos",
    "Junior Aguirre Álvarez",
    "Álvaro Sánchez Antícona",
    "Roxana Cipra Reyes",
    "Rodolfo Aguilar Arteaga",
    "Blanco / Nulo / Viciado",
    "Indeciso / No sabe / No precisa"
];

export const CANDIDATOS_CORTOS = {
    "Ana Belén Vásquez Aguilar": "A. Vásquez",
    "Sandra Guevara Villalobos": "S. Guevara",
    "Junior Aguirre Álvarez": "J. Aguirre",
    "Álvaro Sánchez Antícona": "Á. Sánchez",
    "Roxana Cipra Reyes": "R. Cipra",
    "Rodolfo Aguilar Arteaga": "R. Aguilar",
    "Blanco / Nulo / Viciado": "Blanco/Nulo",
    "Indeciso / No sabe / No precisa": "Indeciso (NS/NC)"
};

// Partido o agrupación de cada candidato (se muestra debajo del nombre).
export const CANDIDATOS_PARTIDO = {
    "Ana Belén Vásquez Aguilar": "APRA",
    "Sandra Guevara Villalobos": "Podemos Perú",
    "Junior Aguirre Álvarez": "Alianza para el Progreso",
    "Álvaro Sánchez Antícona": "Somos Perú",
    "Roxana Cipra Reyes": "Fuerza Popular",
    "Rodolfo Aguilar Arteaga": "Renovación Popular",
    "Blanco / Nulo / Viciado": "",
    "Indeciso / No sabe / No precisa": ""
};

// Nombre base del archivo de foto de cada candidato.
// Las fotos van en frontend/assets/candidatos/<slug>.<ext>.
// CANDIDATOS_EXT indica la extensión real de cada archivo para cargarla
// directamente (evita intentos fallidos). Si el archivo no existe,
// se muestra un avatar con la inicial.
export const CANDIDATOS_SLUG = {
    "Ana Belén Vásquez Aguilar": "ana-belen-vasquez",
    "Sandra Guevara Villalobos": "sandra-guevara",
    "Junior Aguirre Álvarez": "junior-aguirre",
    "Álvaro Sánchez Antícona": "alvaro-sanchez",
    "Roxana Cipra Reyes": "roxana-cipra",
    "Rodolfo Aguilar Arteaga": "rodolfo-aguilar"
};

export const CANDIDATOS_EXT = {
    "Ana Belén Vásquez Aguilar": "jpg",
    "Sandra Guevara Villalobos": "jpg",
    "Junior Aguirre Álvarez": "png",
    "Álvaro Sánchez Antícona": "png",
    "Roxana Cipra Reyes": "png",
    "Rodolfo Aguilar Arteaga": "png"
};

// Nombre base del logo de cada partido.
// Los logos van en frontend/assets/partidos/<slug>.png
export const PARTIDOS_SLUG = {
    "APRA": "apra",
    "Podemos Perú": "podemos-peru",
    "Alianza para el Progreso": "alianza-para-el-progreso",
    "Somos Perú": "somos-peru",
    "Fuerza Popular": "fuerza-popular",
    "Renovación Popular": "renovacion-popular"
};

// Lista de partidos de la cartilla (Pregunta 3). Fuente única de verdad.
export const PARTIDOS = [
    "APRA",
    "Podemos Perú",
    "Alianza para el Progreso",
    "Somos Perú",
    "Fuerza Popular",
    "Renovación Popular",
    "Blanco / Nulo / Viciado",
    "Indeciso / No sabe / No precisa"
];
