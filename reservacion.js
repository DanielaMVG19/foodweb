const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema({
    restaurante: { type: String, required: true },
    nombreCliente: { type: String, required: true },
    personas: { type: Number, required: true },
    hora: { type: String, required: true },
    fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reservation', ReservationSchema);