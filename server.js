require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt"); 
const fs = require("fs"); 
const morgan = require("morgan"); 
const saltRounds = 10; 

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =====================
// 🛡️ MONITOREO Y LOGS
// =====================
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// =====================
// 🔗 CONEXIÓN MONGODB
// =====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Conectado"))
  .catch(err => console.error("❌ Error Mongo:", err));

// =====================
// 📦 MODELOS
// =====================
const UsuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: String,
  username: { type: String, unique: true, sparse: true }, // sparse ayuda si hay nulos
  email: { type: String, required: true, unique: true },
  telefono: String,
  password: { type: String, required: true },
  intentosFallidos: { type: Number, default: 0 },
  estaBloqueado: { type: Boolean, default: false }
}, { collection: 'usuarios' });

const Usuario = mongoose.model("Usuario", UsuarioSchema);

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
  restaurante: String, 
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
      nombre: r._id, porcentaje: Math.round((r.total / maxReservas) * 100), cantidad: r.total
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
  } catch (e) { res.status(500).json({ msg: "Error stats" }); }
});

// =====================
// 🔐 RUTAS DE ACCESO (FIXED)
// =====================
app.post("/register", async (req, res) => {
  try {
    const { password, email, username, ...datos } = req.body;
    
    // 1. Limpieza preventiva: buscamos si ya existe por email o username
    const existe = await Usuario.findOne({ $or: [{ email }, { username }] });
    if (existe) {
      return res.status(400).json({ 
        msg: `Error: El ${existe.email === email ? 'Email' : 'Username'} ya está registrado.` 
      });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const nuevoUsuario = new Usuario({ email, username, ...datos, password: hashedPassword });
    await nuevoUsuario.save();
    
    res.status(201).json({ msg: "Registro exitoso", nombre: nuevoUsuario.nombre });
  } catch (e) {
    console.log("❌ ERROR DETALLADO:", e.message);
    res.status(400).json({ msg: "Error en el servidor al registrar." });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const usuario = await Usuario.findOne({ email });
  const ipAtacante = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!usuario) {
    await mongoose.connection.collection("security_logs").insertOne({
      ip: ipAtacante, email: email, resultado: "fallo", fecha: new Date()
    });
    return res.status(401).json({ msg: "Credenciales inválidas" });
  }
  if (usuario.estaBloqueado) return res.status(403).json({ msg: "Cuenta bloqueada." });

  const esCorrecto = await bcrypt.compare(password, usuario.password);
  if (!esCorrecto) {
    usuario.intentosFallidos += 1;
    await mongoose.connection.collection("security_logs").insertOne({
      ip: ipAtacante, email: email, resultado: "fallo", fecha: new Date(), intento: usuario.intentosFallidos
    });
    if (usuario.intentosFallidos >= 4) usuario.estaBloqueado = true;
    await usuario.save();
    return res.status(401).json({ msg: `Intento ${usuario.intentosFallidos} de 4.` });
  }

  await mongoose.connection.collection("security_logs").insertOne({
    ip: ipAtacante, email: email, resultado: "exito", fecha: new Date()
  });
  usuario.intentosFallidos = 0;
  await usuario.save();
  res.json({ nombre: usuario.nombre, email: usuario.email, tipo: "cliente" });
});

app.post("/login-staff", async (req, res) => {
  const { email, password } = req.body;
  const emp = await Empleado.findOne({ email });
  if (!emp) return res.status(401).json({ msg: "Acceso denegado Staff" });
  const esCorrecto = await bcrypt.compare(password, emp.password);
  if (!esCorrecto) return res.status(401).json({ msg: "Acceso denegado Staff" });
  res.json({ nombre: emp.nombre, email: emp.email, tipo: "staff" });
});

// =====================
// 👑 RESTO DE RUTAS (RESERVAS, PEDIDOS, ADMIN)
// =====================
app.post("/nuevo-staff", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const nuevoEmpleado = new Empleado({ nombre, email, password: hashedPassword });
    await nuevoEmpleado.save();
    res.status(201).json({ msg: `✅ Empleado ${nombre} dado de alta.` });
  } catch (e) { res.status(400).json({ msg: "Error al crear staff." }); }
});

app.get("/admin/pedidos", async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ fecha: -1 });
    res.json(pedidos);
  } catch (e) { res.status(500).json({ msg: "Error pedidos" }); }
});

app.patch("/admin/actualizar-estatus/:id", async (req, res) => {
  try {
    await Pedido.findByIdAndUpdate(req.params.id, { estatus: req.body.nuevoEstatus });
    res.json({ msg: "Actualizado" });
  } catch (e) { res.status(500).json({ msg: "Error" }); }
});

app.post("/reserve", async (req, res) => {
  try {
    const { fecha, hora, ...resto } = req.body;
    const fechaHora = new Date(`${fecha}T${hora}:00`);
    const nuevaReserva = new Reserva({ ...resto, fechaHora });
    await nuevaReserva.save();
    res.status(200).json({ id: nuevaReserva._id });
  } catch (e) { res.status(500).json({ msg: "Error reserva" }); }
});

app.get("/mis-reservas/:email", async (req, res) => {
  try {
    const reservas = await Reserva.find({ emailCliente: req.params.email }).sort({ fechaHora: -1 });
    res.json(reservas);
  } catch (e) { res.status(500).json({ msg: "Error" }); }
});

app.post("/enviar-pedido", async (req, res) => {
  try {
    const nuevoPedido = new Pedido(req.body);
    await nuevoPedido.save();
    res.status(201).json({ success: true, id: nuevoPedido._id });
  } catch (e) { res.status(500).json({ msg: "Error" }); }
});

app.get("/mis-pedidos/:email", async (req, res) => {
  try {
    const pedidos = await Pedido.find({ emailCliente: req.params.email }).sort({ fecha: -1 });
    res.json(pedidos);
  } catch (e) { res.status(500).json({ msg: "Error" }); }
});

app.get("/setup-admin", async (req, res) => {
  const existe = await Empleado.findOne({ email: "admin1@sloteats.com" });
  if (existe) return res.send("Ya existe.");
  const hashedPassword = await bcrypt.hash("adminpassword123", saltRounds);
  const nuevoAdmin = new Empleado({ nombre: "Admin", email: "admin1@sloteats.com", password: hashedPassword, rol: "admin" });
  await nuevoAdmin.save();
  res.send("Admin creado.");
});

app.get("/limpiar-todo", async (req, res) => {
  await Reserva.deleteMany({});
  await Pedido.deleteMany({});
  res.send("Limpieza completada.");
});

// 🔥 RUTA DE EMERGENCIA PARA BORRAR CUALQUIER COSA
app.get("/force-delete/:email", async (req, res) => {
  await Usuario.deleteMany({ email: req.params.email });
  res.send("Eliminado de raíz.");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor SlotEats corriendo en puerto ${PORT}`);
});