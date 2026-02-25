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
    const usuario = await Usuario.findOne({ email, password }); // Nota: Usa bcrypt en el futuro
    if (!usuario) return res.status(401).json({ msg: "Credenciales inválidas" });
    res.json({ nombre: usuario.nombre, email: usuario.email });
});

app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ id: nuevaReserva._id });
    } catch (e) { res.status(500).json({ msg: "Error al guardar" }); }
});

// --- RUTA NUEVA: GENERAR QR ---
app.post('/generar-qr', async (req, res) => {
    try {
        const { reservaId } = req.body;
        const reserva = await Reserva.findById(reservaId);

        if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

        // Lógica de 24 horas (opcional, aquí la implementamos simple)
        const ahora = new Date();
        if (reserva.ultimoQRGenerado && (ahora - reserva.ultimoQRGenerado) < 24 * 60 * 60 * 1000) {
            return res.status(429).json({ msg: "Solo puedes generar un QR cada 24 horas." });
        }

        // Datos que irán dentro del QR
        const datosQR = `Reserva: ${reserva._id}\nRestaurante: ${reserva.restaurante}\nCliente: ${reserva.nombreCliente}`;
        
        const qrImagen = await QRCode.toDataURL(datosQR);
        
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();

        res.json({ qrImagen });
    } catch (e) {
        res.status(500).json({ msg: "Error generando QR" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));
