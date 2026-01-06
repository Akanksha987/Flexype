const { v4: uuidv4 } = require('uuid');
const Inventory = require('../model/inventory');
const Reservation = require('../model/reservation');

let expiryInterval = null;

async function initSku(sku, stock) {
  stock = Number(stock);
  await Inventory.updateOne({ sku }, { $set: { stock }, $setOnInsert: { reserved: 0 } }, { upsert: true });
}

async function getSkuInfo(sku) {
  const inv = await Inventory.findOne({ sku }).lean();
  if (!inv) return null;
  const available = Math.max(0, inv.stock - inv.reserved);
  return { sku: inv.sku, stock: inv.stock, reserved: inv.reserved, available };
}

async function reserve({ sku, qty, userId, reservationId = null, ttlMs = 5 * 60 * 1000 }) {
  if (!sku || !qty || qty <= 0) throw new Error('invalid_parameters');
  qty = Number(qty);
  if (!reservationId) reservationId = uuidv4();

  // idempotency: return existing if present
  const existing = await Reservation.findOne({ reservationId }).lean();
  if (existing) return { reservationId, ...existing, idempotent: true };

  // Atomically increase reserved only if enough available
  const filter = {
    sku,
    $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, qty] }
  };
  const upd = { $inc: { reserved: qty } };
  const r = await Inventory.updateOne(filter, upd);
  if (!r.matchedCount || r.matchedCount === 0) {
    console.log('Insufficient stock for reservation', r.matchedCount);
    throw new Error('insufficient_stock');
  }

  const expiresAt = new Date(Date.now() + ttlMs);
  const reservationDoc = await Reservation.create({ reservationId, sku, qty, userId, expiresAt, status: 'active' });

  return { reservationId, sku, qty, userId, expiresAt: reservationDoc.expiresAt, status: 'active' };
}

async function confirm(reservationId) {
  const r = await Reservation.findOne({ reservationId });
  if (!r) throw new Error('reservation_not_found');
  if (r.status === 'confirmed') return { reservationId, status: 'confirmed' };
  if (r.status === 'expired') throw new Error('reservation_expired');
  if (r.status !== 'active') throw new Error('invalid_reservation_state');

  // Atomically decrement stock and reserved
  const filter = {
    sku: r.sku,
    $expr: { $and: [{ $gte: ['$reserved', r.qty] }, { $gte: ['$stock', r.qty] }] }
  };
  const upd = { $inc: { stock: -r.qty, reserved: -r.qty } };
  const invRes = await Inventory.updateOne(filter, upd);
  if (!invRes.matchedCount || invRes.matchedCount === 0) {
    throw new Error('insufficient_stock_on_confirm');
  }

  r.status = 'confirmed';
  await r.save();
  return { reservationId, status: 'confirmed' };
}

async function cancel(reservationId) {
  const r = await Reservation.findOne({ reservationId });
  if (!r) throw new Error('reservation_not_found');
  if (r.status === 'canceled' || r.status === 'expired') return { reservationId, status: r.status };

  if (r.status === 'confirmed') return { reservationId, status: 'confirmed' };

  // only active reservations decrement reserved
  if (r.status === 'active') {
    const updated = await Reservation.findOneAndUpdate({ reservationId, status: 'active' }, { $set: { status: 'canceled' } }, { new: true });
    if (updated) {
      await Inventory.updateOne({ sku: r.sku }, { $inc: { reserved: -r.qty } });
      return { reservationId, status: 'canceled' };
    }
  }

  return { reservationId, status: r.status };
}

async function expireReservation(reservationId, qty, sku) {
  // set to expired only if still active
  const updated = await Reservation.findOneAndUpdate({ reservationId, status: 'active' }, { $set: { status: 'expired' } });
  if (updated) {
    await Inventory.updateOne({ sku }, { $inc: { reserved: -qty } });
  }
}

function startExpiryWatcher(intervalMs = 30 * 1000) {
  if (expiryInterval) return;
  expiryInterval = setInterval(async () => {
    try {
      const now = new Date();
      const expired = await Reservation.find({ status: 'active', expiresAt: { $lt: now } }).lean();
      for (const r of expired) {
        await expireReservation(r.reservationId, r.qty, r.sku);
      }
    } catch (e) {
      // swallow errors to keep watcher alive
      console.error('expiry watcher error', e.message);
    }
  }, intervalMs);
}

function stopExpiryWatcher() {
  if (expiryInterval) clearInterval(expiryInterval);
  expiryInterval = null;
}

module.exports = {
  initSku,
  getSkuInfo,
  reserve,
  confirm,
  cancel,
  startExpiryWatcher,
  stopExpiryWatcher
};
