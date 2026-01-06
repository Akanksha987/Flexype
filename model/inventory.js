const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  stock: { type: Number, required: true, default: 0 },
  reserved: { type: Number, required: true, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', InventorySchema);
