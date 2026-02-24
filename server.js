const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const QRCode = require('qrcode'); // Librería para el QR
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Conexión a MongoDB Atlas
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Conectado: Sistema SlotEats Operativo'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- 2. MODELOS DE DATOS ---

const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: String,
    apellido: String,
    username: { type: String, required: true, unique: true },
    email: String,
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
    registroFecha: { type: Date, default: Date.now },
    ultimoQRGenerado: { type: Date, default: null } // Control de tiempo
}));

// --- 3. RUTAS ---

// Registro
app.post('/register', async (req, res) => {
    try {
        const nuevo = new Usuario(req.body);
        await nuevo.save();
        res.status(200).json({ msg: "Registrado con éxito", nombre: nuevo.nombre });
    } catch (e) { 
        res.status(500).json({ msg: "Error: El usuario ya existe." }); 
    }
});

// Login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Usuario.findOne({ username, password });
        if (user) {
            res.status(200).json({ msg: "Ok", nombre: user.nombre });
        } else {
            res.status(401).json({ msg: "Usuario o contraseña incorrectos" });
        }
    } catch (e) { res.status(500).json({ msg: "Error en el servidor" }); }
});

// Reservas (Modificada para devolver el ID)
app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ msg: "¡Reserva guardada!", id: nuevaReserva._id });
    } catch (e) {
        res.status(500).json({ msg: "Error al guardar la reserva" });
    }
});

// NUEVA RUTA: Generar QR con validación de 24 horas
app.post('/generar-qr', async (req, res) => {
    try {
        const { reservaId } = req.body;
        const reserva = await Reserva.findById(reservaId);
        
        if (!reserva) return res.status(404).json({ msg: "Reserva no encontrada" });

        const ahora = new Date();
        
        if (reserva.ultimoQRGenerado) {
            const diferenciaHoras = (ahora - reserva.ultimoQRGenerado) / (1000 * 60 * 60);
            if (diferenciaHoras < 24) {
                const horasRestantes = Math.ceil(24 - diferenciaHoras);
                return res.status(403).json({ msg: `Espera ${horasRestantes} horas para generar otro QR.` });
            }
        }

        const dataQR = `SLOTEATS RESERVA\nRestaurante: ${reserva.restaurante}\nCliente: ${reserva.nombreCliente}\nPersonas: ${reserva.personas}\nFecha: ${reserva.fecha} ${reserva.hora}`;
        
        const qrImagen = await QRCode.toDataURL(dataQR);
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();

        res.json({ qrImagen });
    } catch (e) {
        res.status(500).json({ msg: "Error al procesar QR" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));