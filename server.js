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

// NUEVO: Modelo de Pedidos para el Carrito Global
const Pedido = mongoose.model("Pedido", new mongoose.Schema({
  nombreCliente: String,
  emailCliente: String,
  items: Array,
  total: Number,
  ubicacion: String,
  distanciaKm: Number, // Para lógica de cancelación pro
  fecha: { type: Date, default: Date.now },
  estatus: { type: String, default: "Recibido" } // Recibido, Preparando, En Camino
}));

// =====================
// 📊 DASHBOARD DE RANKING
// =====================
app.get("/stats-ranking", async (req, res) => {
  try {
    const todosLosRes = ["Burger Galaxy", "Pizza Nostra", "Sushi Master", "Chicken House"];
    const rankingRes = await Reserva.aggregate([
      { $group: { _id: "$restaurante", total: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    const maxReservas = rankingRes.length > 0 ? rankingRes[0].total : 1;
    const topRestaurantes = rankingRes.slice(0, 5).map(r => ({
      nombre: r._id,
      porcentaje: Math.round((r.total / maxReservas) * 100),
      cantidad: r.total
    }));

    const nombresConReserva = rankingRes.map(r => r._id);
    const sinReserva = todosLosRes.filter(n => !nombresConReserva.includes(n));
    let menosSolicitados = sinReserva.map(n => ({ nombre: n, porcentaje: 5 }));

    const topComidas = [
      { nombre: "Monster Burger", pedidos: (rankingRes.find(r => r._id === "Burger Galaxy")?.total || 0) * 12 + 10 },
      { nombre: "Sushi Master Roll", pedidos: (rankingRes.find(r => r._id === "Sushi Master")?.total || 0) * 8 + 5 },
      { nombre: "Pizza Peperoni", pedidos: (rankingRes.find(r => r._id === "Pizza Nostra")?.total || 0) * 10 + 2 }
    ].sort((a, b) => b.pedidos - a.pedidos);

    res.json({ topRestaurantes, topComidas, menosSolicitados: menosSolicitados.slice(0, 3) });
  } catch (e) {
    res.status(500).json({ msg: "Error al obtener estadísticas" });
  }
});

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
// 📅 RESERVAS
// =====================
app.post("/reserve", async (req, res) => {
  try {
    const { fecha, hora, ...resto } = req.body;
    const fechaTexto = `${fecha}T${hora}:00`;
    const fechaHora = new Date(new Date(fechaTexto).toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const nuevaReserva = new Reserva({ ...resto, fechaHora });
    await nuevaReserva.save();
    res.status(200).json({ id: nuevaReserva._id });
  } catch (e) {
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
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const diferenciaHoras = (reserva.fechaHora - ahora) / (1000 * 60 * 60);
    if (diferenciaHoras < 0.9) return res.status(403).json({ msg: `Falta poco tiempo. Llama al restaurante.` });
    await Reserva.findByIdAndDelete(req.params.id);
    res.json({ msg: "Reserva cancelada correctamente" });
  } catch (e) {
    res.status(500).json({ msg: "Error al cancelar" });
  }
});

// =====================
// 🛒 RUTAS DE PEDIDOS (NUEVO)
// =====================
app.post("/enviar-pedido", async (req, res) => {
  try {
    const nuevoPedido = new Pedido(req.body);
    await nuevoPedido.save();
    res.status(201).json({ success: true, msg: "¡Pedido enviado a cocina!" });
  } catch (e) {
    res.status(500).json({ msg: "Error al procesar pedido" });
  }
});

app.get("/mis-pedidos/:email", async (req, res) => {
  try {
    const pedidos = await Pedido.find({ emailCliente: req.params.email }).sort({ fecha: -1 });
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ msg: "Error al obtener pedidos" });
  }
});

app.delete("/cancelar-pedido/:id", async (req, res) => {
  try {
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) return res.status(404).json({ msg: "Pedido no encontrado" });

    // LÓGICA PRO: Cancelación basada en tiempo/distancia
    const ahora = new Date();
    const minutosTranscurridos = (ahora - pedido.fecha) / (1000 * 60);
    
    // Si la distancia es corta (< 2km), solo damos 2 min. Si es larga, 5 min.
    const tiempoLimite = pedido.distanciaKm < 2 ? 2 : 5;

    if (minutosTranscurridos > tiempoLimite) {
      return res.status(403).json({ msg: "El pedido ya está en preparación y no puede cancelarse." });
    }

    await Pedido.findByIdAndDelete(req.params.id);
    res.json({ msg: "Pedido cancelado correctamente" });
  } catch (e) {
    res.status(500).json({ msg: "Error al cancelar pedido" });
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
    const ticketTexto = `======= 🍕 SLOTEATS TICKET 🍔 =======\nID: ${reserva._id}\nREST: ${reserva.restaurante.toUpperCase()}`;
    const qrImagen = await QRCode.toDataURL(ticketTexto, { color: { dark: "#e84118" }, width: 300 });
    reserva.ultimoQRGenerado = ahora;
    await reserva.save();
    res.json({ qrImagen });
  } catch (e) {
    res.status(500).json({ msg: "Error generando QR" });
  }
});

// =====================
// 🛠 UTILIDADES
// =====================
app.get("/limpiar-todo", async (req, res) => {
  await Reserva.deleteMany({});
  await Pedido.deleteMany({});
  res.send("✅ Limpieza total completada.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));