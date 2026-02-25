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
    emailCliente: String, 
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
    } catch (e) { 
        res.status(500).json({ msg: "Error al guardar reserva" }); 
    }
});

// GENERAR QR (Diseño de Ticket + Colores SlotEats)
app.post('/generar-qr', async (req, res) => {
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

        const qrImagen = await QRCode.toDataURL(ticketTexto, {
            color: {
                dark: '#e84118',  
                light: '#ffffff'  
            },
            width: 300,
            margin: 2
        });
        
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();

        res.json({ qrImagen });
    } catch (e) {
        res.status(500).json({ msg: "Error generando el ticket QR" });
    }
});

app.get('/mis-reservas/:email', async (req, res) => {
    try {
        const reservas = await Reserva.find({ emailCliente: req.params.email });
        res.json(reservas);
    } catch (e) {
        res.status(500).json({ msg: "Error al obtener reservas" });
    }
});

app.delete('/cancelar-reserva/:id', async (req, res) => {
    try {
        const reserva = await Reserva.findById(req.params.id);
        if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

        // Forzamos la fecha a ser interpretada como algo local (tu hora)
        const fechaCita = new Date(`${reserva.fecha}T${reserva.hora}:00`);
        const ahora = new Date();

        const diffMs = fechaCita.getTime() - ahora.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);

        // ESTO ES PARA TI: Mira los logs en Render para ver qué números salen aquí
        console.log(`--- INTENTO DE CANCELACIÓN ---`);
        console.log(`Reserva para: ${reserva.fecha} ${reserva.hora}`);
        console.log(`Cita ms: ${fechaCita.getTime()}`);
        console.log(`Ahora ms: ${ahora.getTime()}`);
        console.log(`Diferencia Horas: ${diffHrs}`);

        // Si la diferencia es menor a 0.9 (para dar un margen de error por segundos)
        if (diffHrs < 0.9) { 
            return res.status(403).json({ 
                msg: `No puedes cancelar. Según el servidor faltan ${diffHrs.toFixed(2)} horas.` 
            });
        }

        await Reserva.findByIdAndDelete(req.params.id);
        res.json({ msg: "Reserva cancelada correctamente" });
    } catch (e) {
        res.status(500).json({ msg: "Error en el servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));