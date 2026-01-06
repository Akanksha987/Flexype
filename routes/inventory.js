const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.post('/reserve', inventoryController.reserve);
router.post('/create', inventoryController.createSku);
router.get('/:sku', inventoryController.getSku);

module.exports = router;
