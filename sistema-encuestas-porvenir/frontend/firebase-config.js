// Importa las funciones necesarias de los SDKs de Firebase (versión estable)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-analytics.js";

// Tus credenciales reales configuradas en Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAz-FtTVRZweqBjucT2wO9lfSiPZPsbgSg",
  authDomain: "encuestas-porvenir.firebaseapp.com",
  projectId: "encuestas-porvenir",
  storageBucket: "encuestas-porvenir.firebasestorage.app",
  messagingSenderId: "67944651624",
  appId: "1:67944651624:web:35a8569a333029637214dd",
  measurementId: "G-PCVEF6NWH7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Persistencia offline: las encuestas se guardan en el dispositivo
// y se sincronizan automáticamente al recuperar la señal.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (error) {
  console.warn("No se pudo activar la persistencia offline:", error);
  db = getFirestore(app);
}

// Exportar los servicios principales para que los uses en tus otros scripts
export const auth = getAuth(app);
export { db };