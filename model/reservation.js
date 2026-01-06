const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema({
  reservationId: { type: String, required: true, unique: true },
  sku: { type: String, required: true, index: true },
  qty: { type: Number, required: true },
  userId: { type: String },
  status: { type: String, enum: ['active','confirmed','canceled','expired'], default: 'active' },
  expiresAt: { type: Date, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Reservation', ReservationSchema);
