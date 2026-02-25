require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Conectado'))
    .catch(err => console.error('❌ Error:', err));

// MODELOS
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: { type: String, required: true },
    apellido: String,
    username: { type: String, unique: true },
    email: { type: String, required: true, unique: true },
    telefono: String,
    password: { type: String, required: true }
}));

const Reserva = mongoose.model('Reserva', new mongoose.Schema({
    restaurante: String,
    nombreCliente: String,
    emailCliente: String, // IMPORTANTE: Para saber de quién es la reserva
    personas: Number,
    fecha: String,
    hora: String,
    notas: String,
    ultimoQRGenerado: { type: Date, default: null }
}));

// --- RUTAS ---

app.post('/register', async (req, res) => {
    try {
        const nuevoUsuario = new Usuario(req.body);
        await nuevoUsuario.save();
        res.status(201).json({ msg: "Registro exitoso", nombre: nuevoUsuario.nombre });
    } catch (e) {
        res.status(400).json({ msg: "Error: El email o username ya existen." });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const usuario = await Usuario.findOne({ email, password });
    if (!usuario) return res.status(401).json({ msg: "Credenciales inválidas" });
    res.json({ nombre: usuario.nombre, email: usuario.email });
});

app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ id: nuevaReserva._id });
    } catch (e) { res.status(500).json({ msg: "Error al guardar reserva" }); }
});

// GENERAR QR (Diseño de Ticket + Colores SlotEats)
app.post('/generar-qr', async (req, res) => {
    try {
        const { reservaId } = req.body;
        const reserva = await Reserva.findById(reservaId);

        if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

        const ahora = new Date();
        // Validación de 24 horas
        if (reserva.ultimoQRGenerado && (ahora - reserva.ultimoQRGenerado) < 24 * 60 * 60 * 1000) {
            return res.status(429).json({ msg: "Solo puedes generar un QR cada 24 horas." });
        }

        // --- DISEÑO DE TICKET DIGITAL ---
        const ticketTexto = `
======= 🍕 SLOTEATS TICKET 🍔 =======
📍 REST: ${reserva.restaurante.toUpperCase()}
👤 CLI:  ${reserva.nombreCliente.toUpperCase()}
👥 PERS: ${reserva.personas}
📅 FECH: ${reserva.fecha}
⏰ HORA: ${reserva.hora}
-------------------------------------
📝 NOTAS: 
${reserva.notas || "Sin notas especiales"}
-------------------------------------
🆔 ID: ${reserva._id}
=====================================
  ¡Presenta este código al llegar!
=====================================`;

        // Generar imagen QR con colores personalizados (Naranja SlotEats)
        const qrImagen = await QRCode.toDataURL(ticketTexto, {
            color: {
                dark: '#e84118',  // Color de los módulos (Naranja)
                light: '#ffffff'  // Color de fondo (Blanco)
            },
            width: 300,
            margin: 2
        });
        
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();

        res.json({ qrImagen });
    } catch (e) {
        console.error(e);
        res.status(500).json({ msg: "Error generando el ticket QR" });
    }
});
// OBTENER RESERVAS DE UN USUARIO ESPECÍFICO
app.get('/mis-reservas/:email', async (req, res) => {
    try {
        const reservas = await Reserva.find({ emailCliente: req.params.email });
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ msg: "Error al obtener reservas" });
    }
});

// CANCELAR RESERVA (Con validación de 1 hora)
app.delete('/cancelar-reserva/:id', async (req, res) => {
    try {
        const reserva = await Reserva.findById(req.params.id);
        if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

        // Validación de tiempo (1 hora antes)
        const ahora = new Date();
        const cita = new Date(`${reserva.fecha}T${reserva.hora}`);
        const diferenciaHoras = (cita - ahora) / (1000 * 60 * 60);

        if (diferenciaHoras < 1) {
            return res.status(403).json({ msg: "Falta menos de 1 hora. Llama al restaurante para cancelar." });
        }

        await Reserva.findByIdAndDelete(req.params.id);
        res.json({ msg: "Reserva cancelada correctamente" });
    } catch (e) {
        res.status(500).json({ msg: "Error al cancelar" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));