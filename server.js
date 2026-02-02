const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB (Railway usará tu MONGO_URI de las variables de entorno)
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- MODELOS ---

// Modelo para Usuarios
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    nombre: String, 
    email: String, 
    password: String
}));

// Modelo para Reservas (ESTO ES LO QUE NECESITAS)
const Reserva = mongoose.model('Reserva', new mongoose.Schema({
    restaurante: String,
    nombreCliente: String,
    personas: Number,
    hora: String,
    fechaCreacion: { type: Date, default: Date.now }
}));

// --- RUTAS ---

// Ruta para Registrar Usuarios
app.post('/register', async (req, res) => {
    try {
        const nuevo = new Usuario(req.body);
        await nuevo.save();
        res.status(200).json({ msg: "¡Usuario registrado!" });
    } catch (e) { res.status(500).json({ msg: "Error al registrar" }); }
});

// Ruta para Guardar Reservas (CONEXIÓN A BASE DE DATOS)
app.post('/reserve', async (req, res) => {
    try {
        const nuevaReserva = new Reserva(req.body);
        await nuevaReserva.save(); // Aquí se guarda en Atlas
        res.status(200).json({ msg: "¡Tu mesa ha sido apartada con éxito!" });
    } catch (e) { 
        console.log(e);
        res.status(500).json({ msg: "No pudimos guardar tu reserva" }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));