const API_URL = "http://localhost:3000";

/* variables para saber en qué anda el chat */
let conversacionActual = null;
let typingMsg = null;
let creandoConversacion = false;
let enviandoMensaje = false;

/* ================= INICIO ================= */

/* lo que se ejecuta apenas carga la página */
window.addEventListener("load", async () => {
  await renderHistorial();
  enfocarInput();

  /* si el usuario ya estaba logueado, ponemos su perfil de una */
  const usuario = obtenerUsuario();
  if (usuario) mostrarPerfil(usuario);
});

/* ================= CHAT ================= */

/* la función principal para mandar mensajes */
async function sendMessage() {
  const usuario = obtenerUsuario();
  /* si no hay usuario, mandarlo a que se loguee */
  if (!usuario) { mostrarLoginModal(); return; }
  
  /* evitar que manden mil mensajes a la vez */
  if (enviandoMensaje) return;
  
  const input = document.getElementById("messageInput");
  const texto = input.value.trim();
  if (!texto) return;

  /* fuera mensaje de bienvenida */
  const welcome = document.getElementById("welcomeMessage");
  if (welcome) welcome.classList.add("hidden");

  enviandoMensaje = true;
  input.value = ""; 
  
  /* 1. poner lo que escribió el usuario en la pantalla */
  appendMessage("user", texto);

  try {
    /* 2. si es chat nuevo, creamos la conversación en la BD */
    if (!conversacionActual) {
      /* el título es el mismo mensaje pero cortito */
      const tituloCorto = texto.length > 20 ? texto.substring(0, 20) + "..." : texto;
      const resConv = await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tituloCorto, user_id: usuario.id })
      });
      conversacionActual = await resConv.json();
      await renderHistorial(); /* actualizamos la lista de la izquierda */
    }

    /* 3. guardamos el mensaje del usuario en la base de datos */
    await fetch(`${API_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversacionActual.id, role: "user", text: texto })
    });

    /* ponemos los puntitos de que el bot está pensando */
    mostrarTyping();

    /* 4. le pedimos la respuesta a la IA */
    const resChat = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: texto })
    });

    const data = await resChat.json();
    ocultarTyping();

    /* 5. mostramos la respuesta del bot y la guardamos */
    appendMessage("bot", data.text);
    await fetch(`${API_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversacionActual.id, role: "bot", text: data.text })
    });

  } catch (err) {
    console.error(err);
    ocultarTyping();
    appendMessage("bot", "Híjole, algo falló en la conexión.");
  } finally {
    enviandoMensaje = false;
  }
}

/* ================= HISTORIAL ================= */

/* para dibujar la lista de chats viejos */
async function renderHistorial() {
  const usuario = obtenerUsuario();
  const list = document.getElementById("historyList");
  
  /* si no hay nadie, que avise que se logueen */
  if (!usuario) {
    list.innerHTML = `<p style="font-size:12px;opacity:.7;padding:10px;">Inicia sesión para ver tu historial</p>`;
    return;
  }

  list.innerHTML = "";

  /* pedimos al servidor los chats de este usuario */
  const res = await fetch(`${API_URL}/conversations?userId=${usuario.id}`);
  const data = await res.json();

  if (!data.length) {
    list.innerHTML = `<p style="font-size:12px;opacity:.7;">Sin conversaciones</p>`;
    return;
  }

  /* creamos cada renglón del historial */
  data.forEach(conv => {
    const item = document.createElement("div");
    item.dataset.id = conv.id;
    item.className = "history-item";

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = conv.titulo;
    title.onclick = () => {
      cargarConversacion(conv.id);
      /* en cel, cerramos el panel al elegir uno */
      document.getElementById("historyPanel")?.classList.remove("open");
    };

    /* los tres puntitos para borrar */
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.textContent = "⋮";
    dots.onclick = e => {
      e.stopPropagation();
      mostrarMenuEliminar(conv.id, dots);
    };

    /* si dejan picado en el cel, también sale para borrar */
    let pressTimer;
    item.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => eliminarConversacion(conv.id), 600);
    });
    item.addEventListener("touchend", () => clearTimeout(pressTimer));

    item.append(title, dots);
    list.appendChild(item);
  });
}

/* para traer los mensajes de un chat viejo */
async function cargarConversacion(id) {
  conversacionActual = { id };

  const res = await fetch(`${API_URL}/messages/${id}`);
  const mensajes = await res.json();

  const chat = document.getElementById("messages");
  chat.innerHTML = ""; 
  ocultarBienvenida();

  /* metemos los mensajes uno por uno al diseño */
  mensajes.forEach(m => appendMessage(m.role, m.text));

  /* iluminamos el que está seleccionado */
  document.querySelectorAll(".history-item").forEach(item => {
    item.classList.toggle("active", item.dataset.id == id);
  });
}

/* ================= ELIMINAR ================= */

/* para borrar un chat para siempre */
async function eliminarConversacion(id) {
  if (!confirm("¿Eliminar conversación?")) return;

  // Agregamos el await para esperar al servidor
  const res = await fetch(`${API_URL}/conversations/${id}`, { method: "DELETE" });

  if (res.ok) {
    const chat = document.getElementById("messages");

    if (conversacionActual?.id === id) {
      chat.innerHTML = "";
      nuevaConversacion(); // Esto limpia la pantalla
    }

    // Refrescamos la lista de la izquierda
    await renderHistorial();
  } else {
    alert("Híjole, no se pudo borrar en el servidor.");
  }
}

/* para mandar una foto a que la IA la vea */
async function enviarImagenServidor(file) {
  mostrarTyping();
  const formData = new FormData();
  formData.append("image", file); 

  try {
    const res = await fetch(`${API_URL}/analyze-image`, {
      method: "POST",
      body: formData 
    });

    const data = await res.json();
    ocultarTyping();
    appendMessage("bot", data.text);
    
    /* guardamos la respuesta de la IA en la BD */
    if (conversacionActual) {
      await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            conversation_id: conversacionActual.id, 
            role: "bot", 
            text: data.text 
        })
      });
    }
  } catch (err) {
    ocultarTyping();
    appendMessage("bot", "Híjole, falló la subida de la imagen.");
  }
}

/* el menú que aparece junto a los puntitos */
function mostrarMenuEliminar(id, anchor) {
  const menu = document.createElement("div");
  menu.className = "delete-menu";
  menu.textContent = "Eliminar";

  menu.onclick = () => {
    eliminarConversacion(id);
    menu.remove();
  };

  document.body.appendChild(menu);

  /* calculamos dónde ponerlo para que no flote en cualquier lado */
  const rect = anchor.getBoundingClientRect();
  menu.style.top = rect.bottom + "px";
  menu.style.left = rect.left + "px";

  /* si hacen clic afuera, se quita */
  document.addEventListener("click", () => menu.remove(), { once: true });
}

/* ================= TYPING ================= */

/* para poner el mensaje de "escribiendo..." */
function mostrarTyping() {
  if (typingMsg) return;
  const container = document.getElementById("messages");
  
  typingMsg = document.createElement("div");
  typingMsg.className = "bot-msg"; 
  typingMsg.textContent = "...";
  
  container.appendChild(typingMsg);
  container.scrollTop = container.scrollHeight;
}

/* quitamos el "escribiendo..." */
function ocultarTyping() {
  typingMsg?.remove();
  typingMsg = null;
}

/* ================= UTILIDADES ================= */

function ocultarBienvenida() {
  document.getElementById("welcomeMessage")?.classList.add("hidden");
}

/* que el cursor se ponga solito en el input */
function enfocarInput() {
  setTimeout(() => {
    document.getElementById("messageInput")?.focus();
  }, 100);
}

/* ================= ENTER ================= */

/* que se mande el mensaje al picar Enter */
document.getElementById("messageInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ================= LOGIN ================= */

/* abre la ventanita para loguearse */
function mostrarLoginModal() {
  limpiarInputs();
  document.getElementById("btnLogin").style.display = "block";
  ocultarAccionesPerfil();
  document.getElementById("loginModal").style.display = "flex";
}

/* muestra el circulito con la inicial */
function mostrarPerfil(usuario) {
  const inicial = usuario.nombre.charAt(0).toUpperCase();
  document.getElementById("loginPlaceholder").innerHTML =
    `<div class="circle-letter" onclick="abrirPerfil()">${inicial}</div>`;
}

/* abre los datos del usuario que ya entró */
function abrirPerfil() {
  const usuario = obtenerUsuario();
  if (!usuario) return;

  nombreInput.value = usuario.nombre;
  correoInput.value = usuario.correo;
  fechaInput.value = usuario.fecha;

  document.getElementById("btnLogin").style.display = "none";
  mostrarAccionesPerfil();
  document.getElementById("loginModal").style.display = "flex";
}

/* borra todo y reinicia para cerrar sesión */
function cerrarSesion() {
  localStorage.removeItem("usuario");
  location.reload();
}

/* saca los datos del usuario del navegador */
function obtenerUsuario() {
  return JSON.parse(localStorage.getItem("usuario"));
}

function limpiarInputs() {
  nombreInput.value = "";
  correoInput.value = "";
  fechaInput.value = "";
}

function mostrarAccionesPerfil() {
  perfilAcciones.style.display = "flex";
}

function ocultarAccionesPerfil() {
  perfilAcciones.style.display = "none";
}

/* cerrar el modal si hacen clic afuera de la caja */
document.getElementById("loginModal").addEventListener("click", e => {
  if (!document.querySelector(".login-box").contains(e.target)) {
    loginModal.style.display = "none";
    enfocarInput();
  }
});

/* abrir/cerrar el historial */
function toggleHistorial() {
  const panel = document.getElementById("historyPanel");
  panel.classList.toggle("open");
}

/* mostrar las opciones del botón "+" */
function togglePlusOptions() {
  const opciones = document.getElementById("plusOptions");
  if (!opciones) return;
  opciones.style.display = opciones.style.display === "flex" ? "none" : "flex";
}

/* para cambiar entre Iniciar Sesión y Crear Cuenta */
let modoRegistro = false;
function alternarModoAuth() {
  modoRegistro = !modoRegistro;
  const titulo = document.getElementById("modalTitle");
  const boton = document.getElementById("btnLogin");
  const toggleLink = document.querySelector("#authToggle a");
  const toggleText = document.getElementById("toggleText");

  if (modoRegistro) {
    titulo.textContent = "Crear Cuenta";
    boton.textContent = "Registrarse";
    toggleText.textContent = "¿Ya tienes cuenta?";
    toggleLink.textContent = "Inicia sesión";
  } else {
    titulo.textContent = "Iniciar Sesión";
    boton.textContent = "Entrar";
    toggleText.textContent = "¿No tienes cuenta?";
    toggleLink.textContent = "Crear cuenta";
  }
}

function mostrarError(mensaje) {
  const errorMsg = document.getElementById("errorMessage");
  errorMsg.textContent = mensaje;
  errorMsg.style.display = "block";
}

/* la lógica de entrar o registrarse */
async function manejarAuth() {
  const nombre = document.getElementById("nombreInput").value.trim();
  const correo = document.getElementById("correoInput").value.trim();
  const fecha = document.getElementById("fechaInput").value;

  if (!nombre || !correo) {
    mostrarError("Nombre y correo son obligatorios");
    return;
  }

  const endpoint = modoRegistro ? "/register" : "/login";

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo, fecha })
    });

    const data = await res.json();
    if (!res.ok) {
      mostrarError(data.message || "Usuario o correo incorrectos");
      return;
    }

    localStorage.setItem("usuario", JSON.stringify({ ...data, fecha }));
    document.getElementById("loginModal").style.display = "none";
    mostrarPerfil(data);
    await renderHistorial();
    enfocarInput();

  } catch (err) {
    mostrarError("Error de conexión con el servidor");
  }
}

/* limpia el chat para empezar de cero */
async function nuevaConversacion() {
  document.getElementById("messages").innerHTML = "";
  document.getElementById("welcomeMessage")?.classList.remove("hidden");
  document.querySelectorAll(".history-item").forEach(item => item.classList.remove("active"));
  conversacionActual = null;   
  enfocarInput();
}

/* si clickean fuera del historial, lo cerramos */
document.addEventListener("click", e => {
  const panel = document.getElementById("historyPanel");
  const menuBtn = document.querySelector(".menu-icon");
  if (!panel || !panel.classList.contains("open")) return;
  if (!panel.contains(e.target) && !menuBtn.contains(e.target)) {
    panel.classList.remove("open");
  }
});

/* si clickean fuera del botón plus, cerramos sus opciones */
document.addEventListener("click", e => {
  const plusOptions = document.getElementById("plusOptions");
  const plusBtn = document.querySelector(".plus-button");
  if (!plusOptions || plusOptions.style.display !== "flex") return;
  if (!plusOptions.contains(e.target) && !plusBtn.contains(e.target)) {
    plusOptions.style.display = "none";
  }
});

/* la función que mete las burbujas de texto al chat */
function appendMessage(role, text) {
  const container = document.getElementById("messages");
  if (!container) return;

  const messageDiv = document.createElement("div");
  messageDiv.className = role + "-msg"; 
  messageDiv.innerText = text;

  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}