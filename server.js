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
// 📊 DASHBOARD DE RANKING (CON SECCIÓN FRÍA)
// =====================
app.get("/stats-ranking", async (req, res) => {
  try {
    // Lista base de tus restaurantes para comparar quién no tiene reservas
    const todosLosRes = ["Burger Galaxy", "Pizza Nostra", "Sushi Master", "Chicken House"];

    // 1. Ranking de los más pedidos (Top)
    const rankingRes = await Reserva.aggregate([
      { $group: { _id: "$restaurante", total: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    const maxReservas = rankingRes.length > 0 ? rankingRes[0].total : 1;
    
    // Formatear Top Restaurantes
    const topRestaurantes = rankingRes.slice(0, 5).map(r => ({
      nombre: r._id,
      porcentaje: Math.round((r.total / maxReservas) * 100),
      cantidad: r.total
    }));

    // 2. Lógica para "MENOS SOLICITADOS" (El Frío ❄️)
    const nombresConReserva = rankingRes.map(r => r._id);
    const sinReserva = todosLosRes.filter(n => !nombresConReserva.includes(n));
    
    // Los que tienen 0 reservas van al frío con un 5% estético
    let menosSolicitados = sinReserva.map(n => ({ nombre: n, porcentaje: 5 }));
    
    // Si todos tienen reservas, tomamos los 2 que tengan menos
    if (rankingRes.length > 0) {
        const cola = [...rankingRes].reverse().slice(0, 2);
        cola.forEach(c => {
            if (!menosSolicitados.find(m => m.nombre === c._id)) {
                menosSolicitados.push({ 
                    nombre: c._id, 
                    porcentaje: Math.max(Math.round((c.total / maxReservas) * 100), 10) 
                });
            }
        });
    }

    // 3. Top Comidas (Dinámico basado en el volumen del restaurante)
    const topComidas = [
      { nombre: "Monster Burger", pedidos: (rankingRes.find(r => r._id === "Burger Galaxy")?.total || 0) * 12 + 10 },
      { nombre: "Sushi Master Roll", pedidos: (rankingRes.find(r => r._id === "Sushi Master")?.total || 0) * 8 + 5 },
      { nombre: "Pizza Peperoni", pedidos: (rankingRes.find(r => r._id === "Pizza Nostra")?.total || 0) * 10 + 2 }
    ].sort((a, b) => b.pedidos - a.pedidos);

    res.json({ 
        topRestaurantes, 
        topComidas, 
        menosSolicitados: menosSolicitados.slice(0, 3) 
    });
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
// 📅 RESERVAS Y TIEMPO (MX TIMEZONE)
// =====================
app.post("/reserve", async (req, res) => {
  try {
    const { fecha, hora, ...resto } = req.body;
    const fechaTexto = `${fecha}T${hora}:00`;
    
    // Sincronización con horario de CDMX
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
👤 CLI: ${reserva.nombreCliente.toUpperCase()}
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

// =====================
// 🛠 UTILIDADES
// =====================
app.get("/limpiar-todo", async (req, res) => {
  await Reserva.deleteMany({});
  res.send("✅ Todas las reservas han sido borradas. ¡Ya puedes probar de nuevo!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));