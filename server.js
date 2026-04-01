require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt"); 
const fs = require("fs"); 
const morgan = require("morgan"); 
const nodemailer = require("nodemailer"); 
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
// 📧 CONFIGURACIÓN NODEMAILER
// =====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "TU_CORREO@gmail.com", 
    pass: "TU_PASSWORD_DE_APLICACION" 
  }
});

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
  password: { type: String, required: true },
  intentosFallidos: { type: Number, default: 0 },
  estaBloqueado: { type: Boolean, default: false },
  codigoDesbloqueo: { type: String, default: null } 
}, { collection: 'usuarios' }));

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
// 🔐 RUTAS DE ACCESO (CON BLOQUEO Y MAIL)
// =====================
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
  
  if (usuario.estaBloqueado) {
    return res.status(403).json({ msg: "Cuenta bloqueada. Revisa tu correo para el código." });
  }

  const esCorrecto = await bcrypt.compare(password, usuario.password);
  
  if (!esCorrecto) {
    usuario.intentosFallidos += 1;
    
    if (usuario.intentosFallidos >= 4) {
      usuario.estaBloqueado = true;
      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      usuario.codigoDesbloqueo = codigo;

      const mailOptions = {
        from: '"SlotEats Security" <tu-correo@gmail.com>',
        to: usuario.email,
        subject: "🚨 Cuenta Bloqueada - SlotEats",
        text: `Hola ${usuario.nombre}, tu cuenta ha sido bloqueada. Usa este código para desbloquearla: ${codigo}`
      };
      transporter.sendMail(mailOptions, (err) => { if(err) console.log(err); });
    }

    await usuario.save();
    await mongoose.connection.collection("security_logs").insertOne({
      ip: ipAtacante, email: email, resultado: "fallo", fecha: new Date(), intento: usuario.intentosFallidos
    });
    return res.status(401).json({ msg: `Intento ${usuario.intentosFallidos} de 4.` });
  }

  usuario.intentosFallidos = 0;
  await usuario.save();
  await mongoose.connection.collection("security_logs").insertOne({
    ip: ipAtacante, email: email, resultado: "exito", fecha: new Date()
  });
  res.json({ nombre: usuario.nombre, email: usuario.email, tipo: "cliente" });
});

// RUTA DE DESBLOQUEO CORREGIDA (NO BORRA NADA, AGREGA LA ACTUALIZACIÓN DE PASSWORD)
app.post("/unlock-account", async (req, res) => {
  const { email, codigo, nuevaPassword } = req.body;
  const usuario = await Usuario.findOne({ email });

  if (usuario && usuario.codigoDesbloqueo === codigo) {
    // Si viene una nueva contraseña, la hasheamos y actualizamos
    if (nuevaPassword) {
      const hashedPassword = await bcrypt.hash(nuevaPassword, saltRounds);
      usuario.password = hashedPassword;
    }
    
    usuario.estaBloqueado = false;
    usuario.intentosFallidos = 0;
    usuario.codigoDesbloqueo = null;
    await usuario.save();
    res.json({ msg: "✅ Cuenta desbloqueada y seguridad actualizada." });
  } else {
    res.status(400).json({ msg: "❌ Código incorrecto." });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { password, ...datos } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const nuevoUsuario = new Usuario({ ...datos, password: hashedPassword });
    await nuevoUsuario.save();
    res.status(201).json({ msg: "Registro exitoso" });
  } catch (e) {
    res.status(400).json({ msg: "Error: El email o username ya existen." });
  }
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
// 👑 RUTAS DE ADMINISTRADOR
// =====================
app.post("/nuevo-staff", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const nuevoEmpleado = new Empleado({ nombre, email, password: hashedPassword });
    await nuevoEmpleado.save();
    res.status(201).json({ msg: `✅ Empleado ${nombre} dado de alta.` });
  } catch (e) {
    res.status(400).json({ msg: "Error al crear staff." });
  }
});

app.get("/admin/pedidos", async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ fecha: -1 });
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ msg: "Error al obtener pedidos" });
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
// 📅 RESERVAS Y PEDIDOS
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

app.post("/enviar-pedido", async (req, res) => {
  try {
    const nuevoPedido = new Pedido(req.body);
    await nuevoPedido.save();
    res.status(201).json({ success: true, id: nuevoPedido._id });
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

// =====================
// 🎟 UTILIDADES
// =====================
app.get("/setup-admin", async (req, res) => {
  try {
    const existe = await Empleado.findOne({ email: "admin1@sloteats.com" });
    if (existe) return res.send("<h1>El Administrador ya existe.</h1>");
    const hashedPassword = await bcrypt.hash("adminpassword123", saltRounds);
    const nuevoAdmin = new Empleado({
      nombre: "Administrador Principal", email: "admin1@sloteats.com", password: hashedPassword, rol: "admin"
    });
    await nuevoAdmin.save();
    res.send("<h1>✅ Administrador creado con éxito.</h1>");
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

app.get("/limpiar-todo", async (req, res) => {
  await Reserva.deleteMany({});
  await Pedido.deleteMany({});
  res.send("✅ Limpieza total completada.");
});

app.get("/borrar-usuario/:email", async (req, res) => {
  await Usuario.deleteOne({ email: req.params.email });
  res.send(`Usuario ${req.params.email} eliminado.`);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor SlotEats corriendo en puerto ${PORT}`);
});