FinSight — AI Agent Build Brief

Project Overview
Build a two-app financial awareness ecosystem called FinSight. The project consists of two separate React + Vite applications that share a Supabase-backed common data layer. App one is a PhonePe payment simulator. App two is the FinSight intelligence dashboard. The current codebase is Supabase-first and keeps local data ephemeral only.

Tech Stack
React with Vite for both apps. Tailwind CSS for styling. Supabase for shared data access. Google Gemini API for all AI features. Chart.js for pie and line charts. jsPDF for weekly report export. Host both apps on Vercel.

App One — PhonePe Simulator
A mobile-width (max 390px centered) payment simulator styled in deep black background with purple accent color #5f2eea. Four screens with bottom navbar navigation.
Home Screen shows wallet balance in large white text, an Add Money button, and a grid of eight spending categories — Food, Transport, Shopping, Entertainment, Health, Education, Utilities, Others. Each category shows its icon and current month total spend. Below the grid show the last five transactions.
Pay Screen has inputs for recipient name, amount in rupees, category dropdown with the eight categories, a Need or Want toggle, and an optional GST number field. When the user taps Pay Now, deduct from wallet balance, write the transaction to Firebase Firestore transactions collection with fields: amount, category, name, type as upi, needOrWant, gst, and timestamp.
EMI Screen lists active EMIs as cards. Each card shows name, monthly amount, due date, and a progress bar. Include two sample EMIs — Phone EMI rupees 2500 due on 5th and Laptop EMI rupees 3200 due on 10th. Add EMI button at bottom.
History Screen shows all transactions from Firebase in reverse chronological order. Each row shows category icon, name, amount in red, time, and Need or Want tag. Include filter buttons for All and each category. Search bar at top.

App Two — FinSight Dashboard
Single scrollable page. Dark theme — background #0a0a0a, cards #1a1a2e, accent blue-purple gradient. All data reads from the shared Supabase-backed data layer.
Build the page in this exact top to bottom section order.
Section 1 — Stats Row shows three cards side by side. Total Spent This Month reads sum of all transactions this month from the shared data layer. Monthly Budget Left shows monthly budget minus total spent. Average Daily Spend shows total spent divided by days elapsed this month. Budget is editable inline — when user changes it, update the shared budget state.
Section 2 — AI Health Score shows a large animated circular score from 0 to 100. Calculate as follows: daily budget equals monthly budget divided by days in month. If spent today is under daily budget score is 76 to 100 and color is green. If spent today is under 1.3x daily budget score is 50 to 75 and color is yellow. If spent today is under 1.5x daily budget score is 25 to 49 and color is orange. If spent today exceeds 1.5x daily budget score is 0 to 24 and color is red. Show label text — Excellent, Healthy, Risky, or Critical. Animate the number counting up on load.
Section 3 — Priority Alerts calls Gemini API with the last 7 days of spending data plus today's date. Gemini returns 4 to 6 alerts each with a message and priority tag of Low, Medium, or Critical. Render as cards. Critical is red, Medium is yellow, Low is green. Refresh automatically when new transaction arrives from the shared data layer.
Section 4 — Charts two cards side by side. Left card is a donut pie chart using Chart.js showing category-wise spending percentage for current month. Right card is a line chart showing daily total spend for the last 7 days. Both update live when new shared transaction arrives.
Section 5 — Next Week Forecast calls Gemini API with last 4 weeks of category-wise spending totals plus current date and upcoming Indian festivals or events context. Gemini returns predicted spend per category for next 7 days and one specific saving suggestion. Display as a card with category breakdown and total predicted amount. Include a toggle for the user to switch between next week view and next month view.
Section 6 — Streak Graph renders a 30-day grid of colored boxes exactly like GitHub contribution graph. Each box represents one day. Green means spent under daily budget. Yellow means spent under 1.3x daily budget. Orange means spent under 1.5x daily budget. Red means spent over 1.5x daily budget. Grey means no data. Show current streak count and best streak. If three or more consecutive red boxes appear, show a banner — Streak broke — Want a recovery plan — with a button that calls Gemini for a personalized recovery suggestion.
Section 7 — AI Finance Coach a chat interface. User types a financial question. On submit, call Gemini API with the full spending history as context plus the user's question. Gemini responds as a personal finance coach with specific advice referencing the user's actual numbers. Show conversation history in the chat window.
Section 8 — Need vs Want reads all transactions and calculates percentage tagged as Need versus Want. Show two progress bars with percentages. Below the bars call Gemini with the Need vs Want ratio and top Want categories — Gemini returns one actionable insight. Example output — 60 percent of your wants were food delivery — cooking 3 days a week saves rupees 1800 monthly.
Section 9 — Bill Upload and GST Validator three sub-features. First is image or PDF receipt upload — send to Gemini which extracts amount, category, and GST number. Second is GST validation — Gemini checks if GST number is valid 15 character format and if tax percentage matches the category. Third is manual cash entry form with fields for name, amount, category, and optional GST. All cash entries add to spending tracker only — they do not deduct from wallet balance. This is critical — type must be saved as cash not upi so dashboard knows not to affect wallet.
Section 10 — Goals user sets a savings goal with a name and target amount. Show progress bar of saved amount versus target. Call Gemini with current saving rate and goal target — Gemini calculates estimated months to reach goal and suggests which specific category to cut to reach it faster.
Section 11 — Marketplace peer to peer gift card and coupon exchange. User can list a gift card or coupon with fields for brand, original value, asking price, expiry, and optional note. Other users can browse listings and purchase. On purchase, platform fee is automatically deducted — rupees 5 to 10 for listings under rupees 500, rupees 15 to 25 for listings rupees 500 to 2000, and 2 percent for listings above rupees 2000. Seller receives asking price minus platform fee. Save all listings in the shared marketplace table with fields: type, brand, originalValue, askingPrice, platformFee, sellerNote, status as active or sold, and timestamp.
Section 12 — Weekly Report auto-generated summary card showing total spent this week, impulse purchases total, savings missed, next week forecast amount, and one key behavioral insight from Gemini. Export as PDF button using jsPDF that downloads a formatted report. Below the report show a Future Risk Radar section — Gemini analyzes next 7 days and returns upcoming risk events like festivals, EMI due dates, or detected impulse patterns with suggested actions.

Supabase Schema
Transactions table stores each payment with amount, category, name, type as upi or cash, needOrWant as need or want, gst as optional string, and timestamp as Unix milliseconds.
Budget table has a single row called current with fields monthly as number and updatedAt as timestamp.
EMIs table stores each EMI with name, amount, and dueDate as day of month number.
Goals table stores each goal with name, targetAmount, and savedAmount.
Streak table stores one row per date with fields date as YYYY-MM-DD string, budgetForDay, spentForDay, and status as green, yellow, orange, or red.
Marketplace table stores each listing with type, brand, originalValue, askingPrice, platformFee, sellerNote, status, and timestamp.

Gemini Integration Rules
Use Google Gemini 1.5 Flash model. Always send spending data as structured JSON in the prompt context. Always ask Gemini to respond in JSON format for structured outputs like alerts and forecasts. For coach and insights, plain text response is fine. Keep all prompts under 2000 tokens. Handle API errors gracefully — show cached or fallback data if Gemini fails during demo.

Critical Rules
One — PhonePe writes to Firebase, FinSight reads from Firebase using real-time listeners. Never poll. Always use onSnapshot.
Two — Cash transactions must never deduct from wallet balance. Only UPI type transactions affect wallet.
Three — Streak graph must update the moment a new transaction arrives and crosses the daily budget threshold.
Four — All rupee amounts display with Indian formatting — rupees 1,00,000 not 100,000.
Five — No dollar signs anywhere in the UI. This is an India-focused product.
Six — Mobile-first for PhonePe. Desktop dashboard for FinSight.
Seven — Demo flow must work flawlessly — PhonePe payment to FinSight live update in under 3 seconds.

Demo Script for Judges
Open FinSight dashboard showing score 84 and three green streak boxes. Open PhonePe side by side. Make rupees 800 Swiggy payment tagged as Food and Want. Watch FinSight score drop live to 61 turning red. Alert fires saying third food delivery this week. Pie chart Food slice grows. Streak box for today turns red. Show Next Week Forecast predicting rupees 8400 for upcoming weekend plus Eid. Open Marketplace and list a PVR gift card of rupees 500 for rupees 350. Show platform fee of rupees 10 auto-calculated. Export Weekly Report as PDF — live download. Total demo time 90 seconds.

Supabase SQL and Connection
Use this as the primary data layer.

1) Set env values in root .env (see .env.example)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- SUPABASE_DB_URL

2) Run SQL schema + seed in Supabase Postgres
- npm run supabase:seed

3) Quick health check from project
- npm run supabase:health

4) API checks (after servers are running)
- GET /api/supabase/health on PhonePe server
- GET /api/supabase/health on FinSight server
