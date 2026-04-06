# PhonePe Local Architecture

## Purpose
This PhonePe folder is a self-contained local demo that runs without Firebase. It uses a Node HTTP server, a SQLite database file, and a static browser UI.

## Main Pieces
- `server.js`: Starts the local HTTP server, serves the browser app, and exposes JSON endpoints.
- `db.js`: Owns the SQLite database, schema creation, seed data, and all data mutations.
- `public/`: Contains the browser UI rendered with vanilla JavaScript and CSS.

## Data Flow
1. The browser loads `public/index.html`.
2. `public/app.js` fetches initial state from `/api/state`.
3. User actions such as top-up, pay, EMI add, or history search update local UI state.
4. Pay and EMI actions call the local API.
5. `db.js` writes to `phonepe.db` and returns updated state.
6. The browser re-renders from the latest local state.

## Database Schema
- `wallet`: single-row table for current balance.
- `transactions`: stores payment history, category, type, need/want, GST, and timestamp.
- `emis`: stores EMI name, amount, and due date.

## UI Screens
- Home: current balance, add money, and category tiles.
- Pay: quick payment form for the selected category.
- Payment Done: success screen with a back-home action.
- History: searchable transaction list.
- EMI: saved EMI list and add-EMI form.

## Notes
- UPI payments deduct wallet balance.
- Cash transactions are still stored in the database, but they do not reduce wallet balance.
- Need/Want is inferred in the database layer, not chosen manually in the Pay form.
- History search updates the list in place so typing stays smooth.
