const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require("express");
const cors = require("cors");
const db = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN - TU NUEVA API KEY
const API_KEY = "AIzaSyAjOaqXAWkGgnC9hCv5nqTVddzBC7n1TFs";

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
if (!fs.existsSync("./uploads")) { fs.mkdirSync("./uploads"); }

/* ================= RUTA CHAT (HÍBRIDO) ================= */
app.post("/chat", async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).send("Falta mensaje");

  // Primero buscamos en la base de datos local
  const sql = "SELECT respuesta FROM conocimientos WHERE ? LIKE CONCAT('%', palabra_clave, '%') ORDER BY RAND() LIMIT 1";

  db.query(sql, [mensaje.toLowerCase()], async (err, results) => {
    if (err || !results || results.length === 0) {
      try {
        const urlAlternativa = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

        const response = await fetch(urlAlternativa, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Eres Quetzal, un experto agrónomo. Responde breve: ${mensaje}` }] }]
          })
        });

        const data = await response.json();

        if (data.error) {
          console.error("DETALLE ERROR GOOGLE:", data.error);
          return res.json({ text: "Error de conexión con Google: " + data.error.message });
        }

        if (data.candidates && data.candidates[0].content) {
          const textoIA = data.candidates[0].content.parts[0].text;
          return res.json({ text: textoIA });
        } else {
          return res.json({ text: "La IA no pudo procesar esa pregunta." });
        }

      } catch (error) {
        console.error("ERROR CRÍTICO:", error);
        return res.json({ text: "Error en el servidor de IA." });
      }
    } else {
      return res.json({ text: results[0].respuesta });
    }
  });
});

/* ================= RUTA ANALIZAR IMAGEN ================= */
app.post("/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ text: "No hay imagen." });
    
    const imageBase64 = fs.readFileSync(req.file.path).toString("base64");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifica plantas o plagas en esta imagen." },
            { inline_data: { mime_type: req.file.mimetype, data: imageBase64 } }
          ]
        }]
      })
    });

    const data = await response.json();
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (data.error) return res.json({ text: "Error en visión: " + data.error.message });
    
    if (data.candidates) {
      res.json({ text: data.candidates[0].content.parts[0].text });
    } else {
      res.json({ text: "No se pudo analizar la imagen." });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ text: "Error de servidor al procesar imagen." });
  }
});

/* ================= RUTAS DE USUARIO Y LOGIN ================= */
app.post("/register", (req, res) => {
  const { nombre, correo } = req.body;
  db.query("INSERT INTO users (nombre, correo) VALUES (?, ?)", [nombre, correo], (err) => {
    if (err) return res.status(500).send(err);
    res.json({ message: "Registro exitoso" });
  });
});

app.post("/login", (req, res) => {
  const { nombre, correo } = req.body;
  db.query("SELECT * FROM users WHERE correo = ? AND nombre = ?", [correo, nombre], (err, rows) => {
    if (err || rows.length === 0) return res.status(401).send("Usuario no encontrado");
    res.json(rows[0]);
  });
});

app.post("/conversations", (req, res) => {
  db.query("INSERT INTO conversations (titulo, user_id) VALUES (?, ?)", [req.body.titulo, req.body.user_id], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ id: result.insertId });
  });
});

app.get("/conversations", (req, res) => {
  db.query("SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC", [req.query.userId], (err, rows) => {
    res.json(rows || []);
  });
});

/* --- NUEVA RUTA PARA ELIMINAR CHATS --- */
app.delete("/conversations/:id", (req, res) => {
  const { id } = req.params;
  // Primero borramos mensajes por la relación de la base de datos
  db.query("DELETE FROM messages WHERE conversation_id = ?", [id], (err) => {
    if (err) return res.status(500).send(err);
    // Luego borramos la conversación
    db.query("DELETE FROM conversations WHERE id = ?", [id], (err) => {
      if (err) return res.status(500).send(err);
      res.sendStatus(200);
    });
  });
});

app.post("/messages", (req, res) => {
  db.query("INSERT INTO messages (conversation_id, role, text) VALUES (?,?,?)", [req.body.conversation_id, req.body.role, req.body.text], (err) => {
    if (err) return res.status(500).send(err);
    res.sendStatus(200);
  });
});

app.get("/messages/:id", (req, res) => {
  db.query("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at", [req.params.id], (err, rows) => {
    res.json(rows || []);
  });
});

app.listen(3000, () => {
  console.log("-----------------------------------------");
  console.log(" Servidor Quetzal corriendo en puerto 3000");
  console.log("-----------------------------------------");
});