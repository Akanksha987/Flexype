const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
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

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // Atomically increase reserved only if enough available
      const filter = {
        sku,
        $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, qty] }
      };
      const upd = { $inc: { reserved: qty } };
      const r = await Inventory.updateOne(filter, upd).session(session);
      if (!r.matchedCount || r.matchedCount === 0) {
        throw new Error('insufficient_stock');
      }

      const expiresAt = new Date(Date.now() + ttlMs);
      const created = await Reservation.create([{ reservationId, sku, qty, userId, expiresAt, status: 'active' }], { session });
      result = { reservationId, sku, qty, userId, expiresAt: created[0].expiresAt, status: 'active' };
    });
  } finally {
    session.endSession();
  }

  return result;
}

async function confirm(reservationId) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const r = await Reservation.findOne({ reservationId }).session(session);
      if (!r) throw new Error('reservation_not_found');
      if (r.status === 'confirmed') {
        result = { reservationId, status: 'confirmed' };
        return;
      }
      if (r.status === 'expired') throw new Error('reservation_expired');
      if (r.status !== 'active') throw new Error('invalid_reservation_state');

      // Atomically decrement stock and reserved
      const filter = {
        sku: r.sku,
        $expr: { $and: [{ $gte: ['$reserved', r.qty] }, { $gte: ['$stock', r.qty] }] }
      };
      const upd = { $inc: { stock: -r.qty, reserved: -r.qty } };
      const invRes = await Inventory.updateOne(filter, upd).session(session);
      if (!invRes.matchedCount || invRes.matchedCount === 0) {
        // If inventory update failed, re-check reservation status to provide idempotent behavior
        const latest = await Reservation.findOne({ reservationId }).session(session);
        if (latest && latest.status === 'confirmed') {
          result = { reservationId, status: 'confirmed' };
          return;
        }
        throw new Error('insufficient_stock_on_confirm');
      }

      r.status = 'confirmed';
      await r.save({ session });
      result = { reservationId, status: 'confirmed' };
    });
  } finally {
    session.endSession();
  }

  return result;
}

async function cancel(reservationId) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const r = await Reservation.findOne({ reservationId }).session(session);
      if (!r) throw new Error('reservation_not_found');
      if (r.status === 'canceled' || r.status === 'expired') {
        result = { reservationId, status: r.status };
        return;
      }
      if (r.status === 'confirmed') {
        result = { reservationId, status: 'confirmed' };
        return;
      }

      // only active reservations decrement reserved
      if (r.status === 'active') {
        const updated = await Reservation.findOneAndUpdate({ reservationId, status: 'active' }, { $set: { status: 'canceled' } }, { new: true, session });
        if (updated) {
          await Inventory.updateOne({ sku: r.sku }, { $inc: { reserved: -r.qty } }).session(session);
          result = { reservationId, status: 'canceled' };
          return;
        }
      }

      result = { reservationId, status: r.status };
    });
  } finally {
    session.endSession();
  }

  return result;
}

async function expireReservation(reservationId, qty, sku) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // set to expired only if still active
      const updated = await Reservation.findOneAndUpdate({ reservationId, status: 'active' }, { $set: { status: 'expired' } }, { session });
      if (updated) {
        await Inventory.updateOne({ sku }, { $inc: { reserved: -qty } }).session(session);
      }
    });
  } finally {
    session.endSession();
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
