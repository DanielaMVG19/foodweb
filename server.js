const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const QRCode = require('qrcode');
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

// Ruta de Registro (Para crear usuarios nuevos)
app.post('/register', async (req, res) => {
    try {
        const nuevoUsuario = new Usuario(req.body);
        await nuevoUsuario.save();
        res.status(201).json({ msg: "Usuario creado con éxito", nombre: nuevoUsuario.nombre });
    } catch (e) {
        res.status(400).json({ msg: "Error al registrar (el email podría ya existir)" });
    }
});

// Ruta de Login (Soluciona el error de 'undefined')
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await Usuario.findOne({ email: email });

        if (!usuario || usuario.password !== password) {
            return res.status(401).json({ msg: "Credenciales inválidas" });
        }

        // Enviamos el nombre real para que el frontend lo muestre
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
    } catch (e) { 
        res.status(500).json({ msg: "Error al guardar" }); 
    }
});

app.post('/generar-qr', async (req, res) => {
    try {
        const { reservaId } = req.body;
        const reserva = await Reserva.findById(reservaId);
        if (!reserva) return res.status(404).json({ msg: "No encontrada" });

        const ahora = new Date();
        if (reserva.ultimoQRGenerado) {
            const dif = (ahora - reserva.ultimoQRGenerado) / (1000 * 60 * 60);
            if (dif < 24) return res.status(403).json({ msg: `Espera ${Math.ceil(24-dif)}h para otro QR` });
        }

        const dataQR = `SLOTEATS RESERVA\nRest: ${reserva.restaurante}\nCliente: ${reserva.nombreCliente}\nPersonas: ${reserva.personas}\nFecha: ${reserva.fecha} ${reserva.hora}\nNotas: ${reserva.notas || 'Ninguna'}`;
        
        const qrImagen = await QRCode.toDataURL(dataQR);
        reserva.ultimoQRGenerado = ahora;
        await reserva.save();
        res.json({ qrImagen });
    } catch (e) { 
        res.status(500).json({ msg: "Error QR" }); 
    }
});

app.get('/mis-reservas/:nombre', async (req, res) => {
    try {
        const lista = await Reserva.find({ nombreCliente: req.params.nombre }).sort({ registroFecha: -1 });
        res.json(lista);
    } catch (e) { 
        res.status(500).send("Error"); 
    }
});

app.post('/cancelar-reserva', async (req, res) => {
    try {
        await Reserva.findByIdAndDelete(req.body.id);
        res.json({ msg: "Cancelada" });
    } catch (e) { 
        res.status(500).send("Error"); 
    }
});

// PUERTO (Railway usa process.env.PORT)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en el puerto ${PORT}`);
});