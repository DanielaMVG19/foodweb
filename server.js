const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const User = require('./userr');
const Reservation = require('./reservacion');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔗 MongoDB (Railway)
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ================== RUTAS ==================

// REGISTRO
app.post('/register', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    const user = new User({ ...req.body, password: hash });
    await user.save();
    res.json({ msg: 'Registro exitoso 🎉' });
  } catch (err) {
    res.status(400).json({ msg: 'Usuario o correo ya existen' });
  }
});

// LOGIN
app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(400).json({ msg: 'Contraseña incorrecta' });

  res.json({ msg: 'Login exitoso', nombre: user.nombre });
});

// RESERVA
app.post('/reserve', async (req, res) => {
  try {
    const reserva = new Reservation(req.body);
    await reserva.save();
    res.json({ msg: 'Reserva guardada 🍽️' });
  } catch (err) {
    res.status(400).json({ msg: 'Error al guardar reserva' });
  }
});

// ================== SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log('🚀 SlotEats corriendo en puerto', PORT)
);
