const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Conexión a MongoDB Atlas
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Conectado con éxito'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- 2. MODELOS DE DATOS ---

// Modelo de Usuario
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: String,
    username: String,
    password: { type: String, required: true }
}));

// Modelo de Reserva (ESTO ES LO QUE FALTABA)
const Reserva = mongoose.model('Reserva', new mongoose.Schema({
    restaurante: String,
    nombreCliente: String,
    personas: Number,
    hora: String,
    fecha: { type: Date, default: Date.now }
}));

// --- 3. RUTAS DE USUARIOS ---

// RUTA: REGISTRO
app.post('/register', async (req, res) => {
    try {
        const nuevo = new Usuario(req.body);
        await nuevo.save();
        res.status(200).json({ msg: "Registrado", nombre: nuevo.nombre });
    } catch (e) { res.status(500).json({ msg: "Error al registrar" }); }
});

// RUTA: LOGIN
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

// --- 4. RUTA DE RESERVAS ---

// RUTA: CREAR RESERVA (Conexión directa a MongoDB)
app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save();
        res.status(200).json({ msg: "¡Mesa reservada correctamente!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ msg: "Error al procesar la reserva" });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));