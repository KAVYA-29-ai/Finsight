# PhonePe Local Architecture

## Purpose
This PhonePe folder is a self-contained demo that runs without Firebase. It uses a Node HTTP server, transient app state, and a static browser UI.

## Main Pieces
- `server.js`: Starts the local HTTP server, serves the browser app, and exposes JSON endpoints.
- `db.js`: Owns the wallet state, schema creation, and all data mutations.
- `public/`: Contains the browser UI rendered with vanilla JavaScript and CSS.

## Data Flow
1. The browser loads `public/index.html`.
2. `public/app.js` fetches initial state from `/api/state`.
3. User actions such as top-up, pay, EMI add, or history search update local UI state.
4. Pay and EMI actions call the API.
5. `db.js` updates in-memory state and returns the latest snapshot.
6. The browser re-renders from the latest available state.

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
- Cash transactions are still stored in app state, but they do not reduce wallet balance.
- Need/Want is inferred in the data layer, not chosen manually in the Pay form.
- History search updates the list in place so typing stays smooth.
