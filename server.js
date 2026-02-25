const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const QRCode = require('qrcode');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXIÓN
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Conectado: Sistema SlotEats Operativo'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- MODELO DE USUARIO AMPLIADO ---
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: { type: String, required: true },
    apellido: String,
    username: { type: String, unique: true },
    email: { type: String, required: true, unique: true },
    telefono: String,
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

// --- RUTA DE REGISTRO CORREGIDA ---
app.post('/register', async (req, res) => {
    try {
        // Recibimos todos los datos que envías desde tu registro.html
        const { nombre, apellido, username, email, telefono, password } = req.body;
        
        const nuevoUsuario = new Usuario({ 
            nombre, 
            apellido, 
            username, 
            email, 
            telefono, 
            password 
        });

        await nuevoUsuario.save();
        res.status(201).json({ msg: "Registro exitoso", nombre: nuevoUsuario.nombre });
    } catch (e) {
        console.log("Error en registro:", e);
        res.status(400).json({ msg: "Error: El email o username ya existen." });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await Usuario.findOne({ email });

        if (!usuario || usuario.password !== password) {
            return res.status(401).json({ msg: "Credenciales inválidas" });
        }

        res.json({ 
            msg: "Bienvenido", 
            nombre: usuario.nombre, 
            email: usuario.email 
        });
    } catch (e) {
        res.status(500).json({ msg: "Error en el servidor" });
    }
});

// RESERVAS
app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ msg: "¡Reserva guardada!", id: nuevaReserva._id });
    } catch (e) { res.status(500).json({ msg: "Error al guardar" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${PORT}`));