const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const QRCode = require('qrcode');
require('dotenv').config(); // Asegúrate de tener instalado dotenv: npm install dotenv

const app = express();

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN A MONGODB
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Conectado: Sistema SlotEats Operativo'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- MODELOS ---

// MODELO DE USUARIO
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

// MODELO DE RESERVA
const Reserva = mongoose.model('Reserva', new mongoose.Schema({
    restaurante: String,
    nombreCliente: String,
    personas: Number,
    fecha: String,
    hora: String,
    notas: String,
    registroFecha: { type: Date, default: Date.now },
    ultimoQRGenerado: { type: Date, default: null }
}));

// --- RUTAS DE AUTENTICACIÓN ---

// REGISTRO: Crea un usuario nuevo
app.post('/register', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        const nuevoUsuario = new Usuario({ nombre, email, password });
        await nuevoUsuario.save();
        res.status(201).json({ msg: "Registro exitoso", nombre: nuevoUsuario.nombre });
    } catch (e) {
        res.status(400).json({ msg: "El email ya está registrado o faltan datos." });
    }
});

// LOGIN: Busca al usuario y devuelve su nombre
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await Usuario.findOne({ email });

        if (!usuario || usuario.password !== password) {
            return res.status(401).json({ msg: "Credenciales inválidas" });
        }

        // Enviamos el nombre para que el frontend lo guarde
        res.json({ 
            msg: "Bienvenido", 
            nombre: usuario.nombre, 
            email: usuario.email 
        });
    } catch (e) {
        res.status(500).json({ msg: "Error en el servidor" });
    }
});

// --- RUTAS DE RESERVA Y QR ---

app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ msg: "¡Reserva guardada!", id: nuevaReserva._id });
    } catch (e) { res.status(500).json({ msg: "Error al guardar" }); }
});

app.post('/generar-qr', async (req, res) => {
    try {
        const { reservaId } = req.body;
        const reserva = await Reserva.findById(reservaId);
        if (!reserva) return res.status(404).json({ msg: "No encontrada" });

        const ahora = new Date();
        const dataQR = `SLOTEATS RESERVA\nRest: ${reserva.restaurante}\nCliente: ${reserva.nombreCliente}\nFecha: ${reserva.fecha} ${reserva.hora}`;
        
        const qrImagen = await QRCode.toDataURL(dataQR);
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();
        res.json({ qrImagen });
    } catch (e) { res.status(500).json({ msg: "Error QR" }); }
});

app.get('/mis-reservas/:nombre', async (req, res) => {
    try {
        const lista = await Reserva.find({ nombreCliente: req.params.nombre }).sort({ registroFecha: -1 });
        res.json(lista);
    } catch (e) { res.status(500).send("Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));