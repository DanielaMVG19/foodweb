const mongoose = require('mongoose');

// Usa la URL corta para esta prueba
const uri = "mongodb+srv://daniberry:daniela123@cluster0.0jbnher.mongodb.net/comidaDB";

console.log("Intentando conectar a MongoDB...");

mongoose.connect(uri)
  .then(() => {
    console.log("✅ ¡CONEXIÓN EXITOSA! El problema no es el Firewall.");
    process.exit();
  })
  .catch(err => {
    console.log("❌ ERROR DE CONEXIÓN:");
    console.log(err.message);
    process.exit();
  });