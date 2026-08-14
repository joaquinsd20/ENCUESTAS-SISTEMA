import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { mostrarToast } from "./ui.js";

// Capturar el rol desde la URL (ej: login.html?rol=admin)
const urlParams = new URLSearchParams(window.location.search);
const rolActual = urlParams.get("rol") || "encuestador";
const esAdmin = rolActual === "admin";

// Personalizar textos según el rol seleccionado
const tituloLogin = document.getElementById("titulo-login");
const subtituloLogin = document.getElementById("subtitulo-login");
const avisoAdmin = document.getElementById("aviso-admin");
const zonaRegistro = document.getElementById("zona-registro");

if (esAdmin) {
    tituloLogin.innerText = "Acceso Administrador";
    subtituloLogin.innerText = "Jefatura · supervisión del equipo de campo";
    // Las cuentas de admin no se crean públicamente
    zonaRegistro.style.display = "none";
    avisoAdmin.style.display = "block";
} else {
    tituloLogin.innerText = "Acceso Encuestador";
    subtituloLogin.innerText = "Encuestador · Personal de campo";
}

let esRegistro = false;
const btnAccion = document.getElementById("btn-accion");
const btnCambiarModo = document.getElementById("btn-cambiar-modo");
const loginForm = document.getElementById("login-form");

// Alternar entre Iniciar Sesión y Crear Cuenta (solo encuestador)
if (btnCambiarModo) {
    btnCambiarModo.addEventListener("click", () => {
        esRegistro = !esRegistro;
        if (esRegistro) {
            tituloLogin.innerText = "Crear Nueva Cuenta";
            subtituloLogin.innerText = "Registro de encuestador de campo";
            btnAccion.innerText = "Registrarse";
            btnCambiarModo.innerText = "¿Ya tienes cuenta? Inicia sesión";
        } else {
            tituloLogin.innerText = "Acceso Encuestador";
            subtituloLogin.innerText = "Encuestador · Personal de campo";
            btnAccion.innerText = "Ingresar";
            btnCambiarModo.innerText = "¿No tienes cuenta? Regístrate aquí";
        }
    });
}

// Manejar el formulario
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (password.length < 6) {
        mostrarToast("La contraseña debe tener al menos 6 caracteres.", "error");
        return;
    }

    btnAccion.disabled = true;
    btnAccion.textContent = esRegistro ? "Registrando..." : "Ingresando...";

    try {
        if (esRegistro) {
            // Solo se permiten cuentas de encuestador desde el registro público
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "usuarios", user.uid), {
                correo: email,
                rol: "encuestador",
                nombre: email.split("@")[0] || email,
                fechaRegistro: new Date()
            });

            mostrarToast("¡Cuenta creada con éxito! Ahora inicia sesión.", "exito", 4000);
            esRegistro = false;
            tituloLogin.innerText = "Acceso Encuestador";
            subtituloLogin.innerText = "Encuestador · Personal de campo";
            btnAccion.innerText = "Ingresar";
            btnCambiarModo.innerText = "¿No tienes cuenta? Regístrate aquí";
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Verificar el rol real del usuario en Firestore
            let rolFire = "encuestador";
            try {
                const snap = await getDoc(doc(db, "usuarios", user.uid));
                if (snap.exists()) rolFire = snap.data().rol || "encuestador";
            } catch (error) {
                console.warn("No se pudo leer el perfil, se asume encuestador:", error);
            }

            if (esAdmin && rolFire !== "admin") {
                mostrarToast("Este usuario no tiene permisos de administrador.", "error", 4000);
                setTimeout(() => window.location.href = "index.html", 1800);
                return;
            }

            if (rolFire === "admin") {
                window.location.href = "admin/dashboard.html";
            } else {
                window.location.href = "encuestador/nueva-encuesta.html";
            }
        }
    } catch (error) {
        console.error("Error en autenticación:", error.message);
        let mensaje = error.message;
        if (error.code === "auth/email-already-in-use") mensaje = "Ese correo ya está registrado.";
        if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") mensaje = "Correo o contraseña incorrectos.";
        if (error.code === "auth/wrong-password") mensaje = "Contraseña incorrecta.";
        mostrarToast(mensaje, "error", 4000);
    } finally {
        btnAccion.disabled = false;
        btnAccion.textContent = esRegistro ? "Registrarse" : "Ingresar";
    }
});
