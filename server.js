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

const Empleado = mongoose.model("Empleado", new mongoose.Schema({
  nombre: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  rol: { type: String, default: "staff" } 
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

const Pedido = mongoose.model("Pedido", new mongoose.Schema({
  restaurante: String, // 👈 AÑADIDO: Para saber de qué restaurante es el pedido
  nombreCliente: String,
  emailCliente: String,
  items: Array,
  total: Number,
  ubicacion: String,
  distanciaKm: Number, 
  fecha: { type: Date, default: Date.now },
  estatus: { type: String, default: "Recibido" } 
}));

// =====================
// 📊 DASHBOARD DE RANKING
// =====================
app.get("/stats-ranking", async (req, res) => {
  try {
    const todosLosRes = ["Burger Galaxy", "Pizza Nostra", "Sushi Master", "Chicken House", "Taco Planet"];
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
// 🔐 RUTAS DE ACCESO
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
  res.json({ nombre: usuario.nombre, email: usuario.email, tipo: "cliente" });
});

app.post("/login-staff", async (req, res) => {
  const emp = await Empleado.findOne({ email: req.body.email, password: req.body.password });
  if (!emp) return res.status(401).json({ msg: "Acceso denegado Staff" });
  res.json({ nombre: emp.nombre, email: emp.email, tipo: "staff" });
});

app.post("/validar-password", async (req, res) => {
  const { email, password } = req.body;
  const usuario = await Usuario.findOne({ email, password });
  if (usuario) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, msg: "Contraseña incorrecta" });
  }
});

// =====================
// 👑 RUTAS DE ADMINISTRADOR (STAFF)
// =====================
app.get("/admin/pedidos", async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ fecha: -1 });
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ msg: "Error al obtener pedidos globales" });
  }
});

app.patch("/admin/actualizar-estatus/:id", async (req, res) => {
  try {
    const { nuevoEstatus } = req.body;
    await Pedido.findByIdAndUpdate(req.params.id, { estatus: nuevoEstatus });
    res.json({ msg: "Pedido actualizado con éxito" });
  } catch (e) {
    res.status(500).json({ msg: "Error al actualizar pedido" });
  }
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
    const reservas = await Reserva.find({ emailCliente: req.params.email }).sort({ fechaHora: -1 });
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
// 🛒 RUTAS DE PEDIDOS
// =====================
app.post("/enviar-pedido", async (req, res) => {
  try {
    const nuevoPedido = new Pedido(req.body);
    await nuevoPedido.save();
    res.status(201).json({ success: true, msg: "¡Pedido enviado a cocina!", id: nuevoPedido._id });
  } catch (e) {
    console.error("Error Pedido:", e);
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
    
    // Si el estatus ya no es "Recibido", no se puede cancelar
    if (pedido.estatus !== "Recibido") {
        return res.status(403).json({ msg: "El pedido ya está en camino o preparación." });
    }

    const ahora = new Date();
    const minutosTranscurridos = (ahora - pedido.fecha) / (1000 * 60);
    const tiempoLimite = pedido.distanciaKm < 2 ? 2 : 5;
    
    if (minutosTranscurridos > tiempoLimite) {
      return res.status(403).json({ msg: "Tiempo límite de cancelación excedido." });
    }
    
    await Pedido.findByIdAndDelete(req.params.id);
    res.json({ msg: "Pedido cancelado correctamente" });
  } catch (e) {
    res.status(500).json({ msg: "Error al cancelar pedido" });
  }
});

// =====================
// 🎟 CÓDIGO QR Y UTILIDADES
// =====================
app.post("/generar-qr", async (req, res) => {
  try {
    const { reservaId } = req.body;
    const reserva = await Reserva.findById(reservaId);
    if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });
    
    const ahora = new Date();
    // Permitir regenerar si han pasado más de 24 horas o si es la primera vez
    if (reserva.ultimoQRGenerado && (ahora - reserva.ultimoQRGenerado) < 24 * 60 * 60 * 1000) {
      // Opcional: Podrías devolver el mismo QR en lugar de un error 429
    }
    
    const ticketTexto = `======= 🍕 SLOTEATS TICKET 🍔 =======\nID: ${reserva._id}\nREST: ${reserva.restaurante.toUpperCase()}\nCLIENTE: ${reserva.nombreCliente}`;
    const qrImagen = await QRCode.toDataURL(ticketTexto, { color: { dark: "#e84118" }, width: 300 });
    
    reserva.ultimoQRGenerado = ahora;
    await reserva.save();
    res.json({ qrImagen });
  } catch (e) {
    res.status(500).json({ msg: "Error generando QR" });
  }
});

app.post("/setup-admin", async (req, res) => {
  const existe = await Empleado.findOne({ email: "admin1@sloteats.com" });
  if (existe) return res.send("Admin ya existe en la base de datos.");
  const nuevoAdmin = new Empleado({
    nombre: "Administrador Principal",
    email: "admin1@sloteats.com",
    password: "adminpassword123",
    rol: "admin"
  });
  await nuevoAdmin.save();
  res.send("✅ Administrador creado con éxito.");
});

app.get("/limpiar-todo", async (req, res) => {
  await Reserva.deleteMany({});
  await Pedido.deleteMany({});
  res.send("✅ Limpieza total completada.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor SlotEats corriendo en puerto ${PORT}`));