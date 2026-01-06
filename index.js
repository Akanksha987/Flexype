const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./db');
const reservationService = require('./services/reservationService');

async function start() {
	await db.connect();
	reservationService.startExpiryWatcher();

    const checkoutRoutes = require('./routes/checkout');
    const inventoryRoutes = require('./routes/inventory');

	const app = express();
	app.use(cors());
	app.use(express.json());
    app.use('/checkout', checkoutRoutes);
    app.use('/inventory', inventoryRoutes);

	const PORT = process.env.PORT || 3000;
	app.listen(PORT, () => {
		console.log(`Server listening on port ${PORT}`);
	});
}

start().catch(err => {
	console.error('Failed to start', err);
	process.exit(1);
});

module.exports = {};
