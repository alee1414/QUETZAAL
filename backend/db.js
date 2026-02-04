const mysql = require("mysql2");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "quetzal_chat"
});

// ESTO ES LO QUE FALTA: El detector de errores
db.getConnection((err, connection) => {
  if (err) {
    console.log("-----------------------------------------");
    console.error("❌ ERROR DE CONEXIÓN A MYSQL:");
    if (err.code === 'ER_BAD_DB_ERROR') console.log("   --> La base de datos 'quetzal_chat' no existe.");
    if (err.code === 'ECONNREFUSED') console.log("   --> MySQL está apagado (Prendelo en XAMPP).");
    console.log("   Detalle técnico:", err.message);
    console.log("-----------------------------------------");
  } else {
    console.log("✅ CONECTADO EXITOSAMENTE A MYSQL (quetzal_chat)");
    connection.release(); // Soltar la conexión
  }
});

module.exports = db;