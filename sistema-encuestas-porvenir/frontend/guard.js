// Protección de rutas: verifica sesión y rol antes de mostrar cada página
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/**
 * verifica la sesión. Devuelve el usuario autenticado o redirige al inicio.
 * @param {string} redireccion URL a donde mandar si no hay sesión o no hay rol
 * @param {"admin"|"encuestador"|null} rolRequerido rol obligatorio (null = solo estar logueado)
 */
export function protegerSesion(redireccion, rolRequerido = null) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = redireccion;
        return;
      }

      if (rolRequerido) {
        try {
          const snap = await getDoc(doc(db, "usuarios", user.uid));
          const datos = snap.exists() ? snap.data() : null;
          if (!datos || datos.rol !== rolRequerido) {
            window.location.href = redireccion;
            return;
          }
        } catch (error) {
          console.error("Error al verificar el rol:", error);
          // Sin conexión: permitimos entrar igual (Firebase Auth ya validó la sesión).
          // El rol se validará de nuevo cuando vuelva la red.
          if (!navigator.onLine) {
            resolve(user);
            return;
          }
          window.location.href = redireccion;
          return;
        }
      }

      resolve(user);
    });
  });
}

export async function cerrarSesion() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
  window.location.href = "../index.html";
}
