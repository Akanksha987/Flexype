const reservationService = require('../services/reservationService');

async function reserve(req, res) {
  try {
    const { sku, qty, userId, reservationId } = req.body;
    const result = await reservationService.reserve({ sku, qty, userId, reservationId });
    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    const code = err.message === 'insufficient_stock' ? 409 : 400;
    res.status(code).json({ ok: false, error: err.message });
  }
}

async function getSku(req, res) {
  try {
    const { sku } = req.params;
    const info = await reservationService.getSkuInfo(sku);
    if (!info) return res.status(404).json({ ok: false, error: 'sku_not_found' });
    res.json({ ok: true, data: info });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function createSku(req, res) {
  try {
    const { sku, stock } = req.body;
    if (!sku || typeof stock === 'undefined') return res.status(400).json({ ok: false, error: 'sku_and_stock_required' });
    await reservationService.initSku(sku, stock);
    const info = await reservationService.getSkuInfo(sku);
    res.status(201).json({ ok: true, data: info });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { reserve, getSku, createSku };
