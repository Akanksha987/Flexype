const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

router.post('/confirm', checkoutController.confirm);
router.post('/cancel', checkoutController.cancel);

module.exports = router;
