const reservationService = require('../services/reservationService');

async function confirm(req, res) {
  try {
    const { reservationId } = req.body;
    const result = await reservationService.confirm(reservationId);
    res.json({ ok: true, data: result });
  } catch (err) {
    console.log('Error in confirm:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
}

async function cancel(req, res) {
  try {
    const { reservationId } = req.body;
    const result = await reservationService.cancel(reservationId);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

module.exports = { confirm, cancel };
