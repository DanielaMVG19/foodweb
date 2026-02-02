const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Conexión a MongoDB Atlas
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Conectado: Sistema SlotEats Operativo'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- 2. MODELOS DE DATOS ---

// Modelo de Usuario (Ahora guarda TODO lo de tu registro.html)
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: String,
    apellido: String,
    username: { type: String, required: true, unique: true },
    email: String,
    telefono: String,
    password: { type: String, required: true }
}));

// Modelo de Reserva (Ahora guarda las NOTAS de tu reserva.html)
const Reserva = mongoose.model('Reserva', new mongoose.Schema({
    restaurante: String,
    nombreCliente: String,
    personas: Number,
    fecha: String,
    hora: String,
    notas: String, // <--- Importante para que no se pierdan los comentarios
    registroFecha: { type: Date, default: Date.now }
}));

// --- 3. RUTAS ---

// Registro
app.post('/register', async (req, res) => {
    try {
        const nuevo = new Usuario(req.body);
        await nuevo.save();
        res.status(200).json({ msg: "Registrado con éxito", nombre: nuevo.nombre });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ msg: "Error: El usuario ya existe o faltan datos." }); 
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

// Reservas
app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ msg: "¡Reserva guardada!" });
    } catch (e) {
        res.status(500).json({ msg: "Error al guardar la reserva" });
    }
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));