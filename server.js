require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =====================
// 🔗 CONEXIÓN MONGODB
// =====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Conectado"))
  .catch(err => console.error("❌ Error Mongo:", err));

// =====================
// 📦 MODELOS
// =====================
const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: String,
  username: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  telefono: String,
  password: { type: String, required: true }
}));

const Reserva = mongoose.model("Reserva", new mongoose.Schema({
  restaurante: String,
  nombreCliente: String,
  emailCliente: String,
  personas: Number,
  fechaHora: { type: Date, required: true }, 
  notas: String,
  ultimoQRGenerado: { type: Date, default: null }
}));

// =====================
// 🔐 RUTAS DE USUARIO
// =====================
app.post("/register", async (req, res) => {
  try {
    const nuevoUsuario = new Usuario(req.body);
    await nuevoUsuario.save();
    res.status(201).json({ msg: "Registro exitoso", nombre: nuevoUsuario.nombre });
  } catch (e) {
    res.status(400).json({ msg: "Error: El email o username ya existen." });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const usuario = await Usuario.findOne({ email, password });
  if (!usuario) return res.status(401).json({ msg: "Credenciales inválidas" });
  res.json({ nombre: usuario.nombre, email: usuario.email });
});

// =====================
// 📅 RESERVAS Y TIEMPO
// =====================

app.post("/reserve", async (req, res) => {
  try {
    const { fecha, hora, ...resto } = req.body;

    // Combinamos fecha y hora. 
    // Si 'hora' viene como "16:22", se crea correctamente para la tarde.
    const fechaTexto = `${fecha}T${hora}:00`;
    
    // Creamos el objeto fecha asegurando que sea la zona horaria de México
    const fechaHora = new Date(new Date(fechaTexto).toLocaleString("en-US", { timeZone: "America/Mexico_City" }));

    console.log(`Guardando reserva: ${fechaHora} (Hora recibida: ${hora})`);

    const nuevaReserva = new Reserva({ ...resto, fechaHora });
    await nuevaReserva.save();
    res.status(200).json({ id: nuevaReserva._id });
  } catch (e) {
    console.error("Error al guardar:", e);
    res.status(500).json({ msg: "Error al guardar reserva" });
  }
});

app.get("/mis-reservas/:email", async (req, res) => {
  try {
    const reservas = await Reserva.find({ emailCliente: req.params.email });
    res.json(reservas);
  } catch (e) {
    res.status(500).json({ msg: "Error al obtener reservas" });
  }
});

app.delete("/cancelar-reserva/:id", async (req, res) => {
  try {
    const reserva = await Reserva.findById(req.params.id);
    if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

    // Obtenemos el 'ahora' sincronizado con México
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const diferenciaHoras = (reserva.fechaHora - ahora) / (1000 * 60 * 60);

    console.log(`Diferencia calculada: ${diferenciaHoras}h`);

    if (diferenciaHoras < 0.9) {
      return res.status(403).json({ 
        msg: `Falta poco tiempo (${diferenciaHoras.toFixed(2)}h). Llama al restaurante.` 
      });
    }

    await Reserva.findByIdAndDelete(req.params.id);
    res.json({ msg: "Reserva cancelada correctamente" });
  } catch (e) {
    res.status(500).json({ msg: "Error al cancelar" });
  }
});

// =====================
// 🎟 CÓDIGO QR
// =====================
app.post("/generar-qr", async (req, res) => {
  try {
    const { reservaId } = req.body;
    const reserva = await Reserva.findById(reservaId);
    if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

    const ahora = new Date();
    if (reserva.ultimoQRGenerado && (ahora - reserva.ultimoQRGenerado) < 24 * 60 * 60 * 1000) {
      return res.status(429).json({ msg: "Solo puedes generar un QR cada 24 horas." });
    }

    const ticketTexto = `
======= 🍕 SLOTEATS TICKET 🍔 =======
📍 REST: ${reserva.restaurante.toUpperCase()}
👤 CLI:  ${reserva.nombreCliente.toUpperCase()}
📅 FECHA: ${reserva.fechaHora.toLocaleDateString('es-MX')}
⏰ HORA: ${reserva.fechaHora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
🆔 ID: ${reserva._id}
=====================================`;

    const qrImagen = await QRCode.toDataURL(ticketTexto, {
      color: { dark: "#e84118", light: "#ffffff" },
      width: 300
    });

    reserva.ultimoQRGenerado = ahora;
    await reserva.save();
    res.json({ qrImagen });
  } catch (e) {
    res.status(500).json({ msg: "Error generando el ticket QR" });
  }
});

const PORT = process.env.PORT || 3000;
// RUTA TEMPORAL PARA LIMPIAR RESERVAS MALAS
app.get("/limpiar-todo", async (req, res) => {
    await Reserva.deleteMany({});
    res.send("✅ Todas las reservas han sido borradas. ¡Ya puedes probar de nuevo!");
});
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));