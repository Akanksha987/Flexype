# Flexype — Smart Inventory Reservation (Prototype)

A small Node.js prototype that implements reservation-style inventory handling (suitable for flash-sale or limited-stock flows).

Key ideas
- Reserve stock for a short TTL, preventing oversell.
- Idempotent reservations using client-provided `reservationId`.
- Confirm to permanently decrement stock, or cancel/expire to release reserved stock.

Tech
- Node.js + Express
- MongoDB via Mongoose
- UUID for idempotency tokens

Requirements
- Node 16+ installed
- A running MongoDB instance (local or cloud)

Quick start

1. Install dependencies

```
npm install
```

2. Provide environment variables (create a `.env` file)

```
DB_URL=mongodb://localhost:27017/flexype
PORT=3000
```

3. Run the app

```
npm start
```

The server starts and connects to MongoDB, and the reservation expiry watcher begins running.

API Reference

Base path: `/` (routes are mounted as `/inventory` and `/checkout`)

- POST /inventory/create
  - Body: `{ "sku": "sku123", "stock": 100 }`
  - Response: `{ ok: true, data: { sku, stock, reserved, available } }` (201)

- POST /inventory/reserve
  - Body: `{ "sku": "sku123", "qty": 1, "userId": "user1", "reservationId": "optional-uuid" }`
  - Notes: If you provide `reservationId` the request is idempotent and will return the existing reservation.
  - Success response: `{ ok: true, data: { reservationId, sku, qty, userId, expiresAt, status } }`
  - Errors: `insufficient_stock` (HTTP 409), `invalid_parameters` (400)

- GET /inventory/:sku
  - Returns SKU info: `{ ok: true, data: { sku, stock, reserved, available } }` or 404 when SKU not found.

- POST /checkout/confirm
  - Body: `{ "reservationId": "<id>" }`
  - Confirms the reservation and permanently decreases `stock` while decreasing `reserved`.
  - Errors: `reservation_not_found`, `reservation_expired`, `insufficient_stock_on_confirm` (400)

- POST /checkout/cancel
  - Body: `{ "reservationId": "<id>" }`
  - Cancels an active reservation and releases reserved quantity back to available stock.

Examples

Reserve (curl):

```
curl -X POST http://localhost:3000/inventory/reserve \
  -H 'Content-Type: application/json' \
  -d '{"sku":"sku123","qty":1,"userId":"user1"}'
```

Confirm (curl):

```
curl -X POST http://localhost:3000/checkout/confirm \
  -H 'Content-Type: application/json' \
  -d '{"reservationId":"<id>"}'
```

Data models (Mongoose)

- Inventory: `{ sku: String, stock: Number, reserved: Number }` — see [model/inventory.js](model/inventory.js#L1)
- Reservation: `{ reservationId: String, sku: String, qty: Number, userId?: String, status: active|confirmed|canceled|expired, expiresAt: Date }` — see [model/reservation.js](model/reservation.js#L1)

Implementation notes
- Idempotency: client-supplied `reservationId` avoids duplicate reservations.
- Reservation TTL: default 5 minutes; the server runs an expiry watcher that sets stale reservations to `expired` and releases reserved stock.
- Atomic updates: the service uses conditional updates to ensure stock/reserved counters change atomically via MongoDB operations.

Where to look in the code

- Controllers: [controllers/inventoryController.js](controllers/inventoryController.js#L1), [controllers/checkoutController.js](controllers/checkoutController.js#L1)
- Routes: [routes/inventory.js](routes/inventory.js#L1), [routes/checkout.js](routes/checkout.js#L1)
- Core logic: [services/reservationService.js](services/reservationService.js#L1)

Production considerations
- Use a managed MongoDB (replica set) and tune write concerns for consistency.
- Consider Redis or distributed locking for high throughput, cross-instance coordination.
- Add authentication, rate-limiting, and observability (metrics/logs/tracing).

License
- ISC
# Smart Inventory Reservation - Basic Scaffold

This project contains a simple in-memory Smart Inventory Reservation prototype for handling flash-sale style concurrency.

APIs
- POST /inventory/reserve
  - Body: `{ sku, qty, userId, reservationId? }`
  - Response: reservation object with `reservationId` and `expiresAt`.
  - Idempotent when `reservationId` is provided.

- POST /inventory/create
  - Body: `{ sku, stock }`
  - Response: reservation object with `reservationId` and `expiresAt`.
  - Idempotent when `reservationId` is provided.

- GET /inventory/:sku
  - Returns `{ sku, stock, reserved, available }`

- POST /checkout/confirm
  - Body: `{ reservationId }`
  - Confirms reservation and permanently reduces stock.

- POST /checkout/cancel
  - Body: `{ reservationId }`
  - Cancels reservation and makes stock available again.

Behavior & Notes
- Reservations expire after 5 minutes by default (server-side timeout).
- Idempotency is supported via client-provided `reservationId`.
- This scaffold uses in-memory stores. For production, use a durable DB and distributed locks.

Run
```
npm install
npm start
```

Examples
Reserve:
```
curl -X POST http://localhost:3000/inventory/reserve -H 'Content-Type: application/json' -d '{"sku":"sku123","qty":1,"userId":"user1"}'
```

Confirm:
```
curl -X POST http://localhost:3000/checkout/confirm -H 'Content-Type: application/json' -d '{"reservationId":"<id>"}'
```
