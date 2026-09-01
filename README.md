<div align="center">

```
███████╗██╗███╗   ██╗███████╗██╗ ██████╗ ██╗  ██╗████████╗
██╔════╝██║████╗  ██║██╔════╝██║██╔════╝ ██║  ██║╚══██╔══╝
█████╗  ██║██╔██╗ ██║███████╗██║██║  ███╗███████║   ██║   
██╔══╝  ██║██║╚██╗██║╚════██║██║██║   ██║██╔══██║   ██║   
██║     ██║██║ ╚████║███████║██║╚██████╔╝██║  ██║   ██║   
╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝  
```

**Smart Financial Awareness Platform for Young India**

[![Status](https://img.shields.io/badge/Status-In%20Development-yellow?style=for-the-badge)]()
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-blue?style=for-the-badge)]()
[![AI](https://img.shields.io/badge/AI-Powered-green?style=for-the-badge)]()
[![India](https://img.shields.io/badge/Market-India-orange?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)]()

*"India has digitized payments. FinSight is digitizing financial awareness."*

</div>

---

## 📖 Table of Contents

- [What is FinSight?](#-what-is-finsight)
- [The Problem](#-the-problem)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Data Pipeline](#-data-pipeline)
- [AI & ML Pipeline](#-ai--ml-pipeline)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Development Roadmap](#-development-roadmap)
- [Contributing](#-contributing)

---

## 💡 What is FinSight?

FinSight is an **AI-powered personal finance platform** built specifically for India's Gen Z. It automatically captures every UPI transaction, categorizes spending using machine learning, detects behavioral patterns, and delivers real-time, context-aware financial guidance — all without the user lifting a finger.

> No manual entry. No spreadsheets. No financial jargon. Just clarity.

### Core Promise
| Without FinSight | With FinSight |
|---|---|
| "Where did my salary go?" | Real-time dashboard of every rupee |
| Overspending invisibly | Alerts before you overspend |
| Generic financial advice | AI advice based on *your* patterns |
| Forgetting savings goals | Goal-tracking with AI-suggested cuts |
| Confused by receipts & GST | Auto-parsed, categorized, tax-ready |

---

## 🔥 The Problem

India processes **14 billion+ UPI transactions/month** — but financial awareness hasn't kept up.

```
99.5%  →  Gen Z users actively on UPI daily
  75%  →  Report overspending due to frictionless digital payments  
  27%  →  Indians who are financially literate
  72%  →  Users who don't use any expense tracker
```

**The gap:** Tools exist. They just don't work. Manual entry, no intelligence, no behavior change.

---

## ✨ Key Features

### 1. 📊 Smart Visual Dashboard
Real-time spending visualization with category-wise breakdown (food, transport, shopping, bills, etc.) using dynamic charts. Updates the moment a transaction hits.

### 2. 💳 UPI Integration (via Account Aggregator)
Automatically captures transactions across all UPI apps — PhonePe, GPay, Paytm, BHIM — using the RBI-regulated **Account Aggregator (AA) framework**. Zero manual input.

### 3. 🧾 Receipt & GST Intelligence
AI extracts and parses receipt data from:
- 📄 PDF receipts
- 🖼️ Image uploads (OCR)
- 📊 CSV/Excel exports

Validates GST format, extracts line items, auto-categorizes, and separates business vs personal spend.

### 4. 🤖 AI Spending Advisor
Personalized financial advice engine that:
- Detects spending anomalies vs your own baseline
- Recommends specific, actionable cuts
- Learns your patterns over time and improves

### 5. 🚨 Context-Aware Smart Alerts *(Flagship)*
The AI understands **real-world context** — not just numbers:
```
🎉 Festival season   →  "Budget extra ₹3,000 for Diwali"           [Medium]
⚠️ Emergency event  →  "Reduce non-essentials, focus on essentials" [Critical]
🎂 Birthday nearby  →  "Expected spending spike this weekend"       [Low]
📈 Budget at 80%    →  "10 days left, 20% budget remaining"         [High]
🛒 Impulse pattern  →  "3rd unplanned purchase this week"           [High]
```

### 6. 🎯 Goal-Based Saving System
Set a target (trip, gadget, emergency fund) → AI reverse-engineers the savings path → Tracks progress and auto-adjusts recommendations.

### 7. 📝 Weekly AI Report
Auto-generated Sunday summary: what you spent, where you overspent, what you saved, and one key action for the week ahead.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│                                                                       │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│   │  React Native │    │  React Web   │    │   PWA (Mobile Web)   │  │
│   │  (iOS/Android)│    │  (Dashboard) │    │   (Lite Version)     │  │
│   └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
└──────────┼───────────────────┼───────────────────────┼──────────────┘
           │                   │                         │
           └───────────────────┼─────────────────────────┘
                               │  HTTPS / WebSocket
┌──────────────────────────────▼──────────────────────────────────────┐
│                          API GATEWAY                                  │
│                    (Kong / AWS API Gateway)                           │
│         Rate Limiting │ Auth │ Load Balancing │ Logging               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          │                    │                       │
┌─────────▼──────┐   ┌─────────▼──────┐   ┌──────────▼──────┐
│  Auth Service  │   │  Core API      │   │  AI/ML Service  │
│  (Node.js)     │   │  (FastAPI)     │   │  (Python)       │
│                │   │                │   │                 │
│  JWT + OAuth2  │   │  REST + WS     │   │  LLM + Models   │
│  Device Mgmt   │   │  Business Logic│   │  Inference API  │
└────────────────┘   └────────┬───────┘   └──────────┬──────┘
                              │                       │
          ┌───────────────────┼───────────────────────┤
          │                   │                       │
┌─────────▼──────┐   ┌────────▼───────┐   ┌──────────▼──────┐
│  Transaction   │   │   Notification │   │  Receipt        │
│  Ingestion     │   │   Service      │   │  Parser         │
│  Service       │   │  (Node.js)     │   │  (Python)       │
│  (Python)      │   │                │   │                 │
│  AA Framework  │   │  FCM / APNs    │   │  OCR + GST AI   │
└────────┬───────┘   └────────────────┘   └─────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                    │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │ MongoDB   │  │  S3 /      │  │
│  │  (Primary DB)│  │  (Cache +    │  │ (AI Logs  │  │  MinIO     │  │
│  │              │  │   Sessions)  │  │  + Events)│  │ (Receipts) │  │
│  └──────────────┘  └──────────────┘  └───────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────┐
│                     EXTERNAL INTEGRATIONS                             │
│                                                                       │
│  ┌────────────────────┐    ┌─────────────────────────────────────┐   │
│  │ Account Aggregator │    │  Calendar / Events API              │   │
│  │ (Setu / Finvu /    │    │  (Festival dates, public holidays)  │   │
│  │  Onemoney)         │    └─────────────────────────────────────┘   │
│  └────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend
| Layer | Technology | Purpose |
|---|---|---|
| Mobile App | React Native + Expo | iOS & Android |
| Web Dashboard | React.js + Vite | Browser-based access |
| State Management | Zustand | Lightweight global state |
| Charts & Viz | Recharts + D3.js | Spending graphs |
| Styling | Tailwind CSS + NativeWind | Consistent design system |
| Real-time | Socket.io Client | Live transaction updates |

### Backend
| Layer | Technology | Purpose |
|---|---|---|
| Core API | FastAPI (Python) | Primary REST API |
| Auth Service | Node.js + Express | JWT, OAuth2, sessions |
| Notification Service | Node.js | Push alerts, emails |
| Message Queue | Apache Kafka | Async transaction events |
| API Gateway | Kong | Rate limit, routing, auth |
| WebSockets | Socket.io | Real-time dashboard feed |

### AI & ML
| Component | Technology | Purpose |
|---|---|---|
| LLM (Advisor) | GPT-4o / Claude 3 (via API) | Natural language advice |
| Transaction Classifier | Fine-tuned DistilBERT | Auto-categorization |
| Receipt OCR | Google Vision API / Tesseract | Extract receipt data |
| GST Validator | Custom rule engine | Indian GST format checks |
| Anomaly Detection | Isolation Forest (scikit-learn) | Detect spending spikes |
| Context Engine | Custom NLP pipeline | Festival / event awareness |
| Embeddings | sentence-transformers | Semantic search in history |

### Data & Infrastructure
| Component | Technology | Purpose |
|---|---|---|
| Primary Database | PostgreSQL 15 | Users, transactions, goals |
| Cache | Redis | Sessions, real-time state |
| Document Store | MongoDB | AI event logs, audit trail |
| File Storage | AWS S3 / MinIO | Receipt images and PDFs |
| Search | Elasticsearch | Transaction search & filter |
| Containerization | Docker + Docker Compose | Local and prod environments |
| Orchestration | Kubernetes (K8s) | Production deployment |
| CI/CD | GitHub Actions | Automated test & deploy |
| Monitoring | Prometheus + Grafana | Metrics and alerting |
| Logs | ELK Stack | Centralized logging |

### External APIs
| Service | Provider | Purpose |
|---|---|---|
| Account Aggregator | Setu AA / Finvu | Live bank + UPI data |
| Push Notifications | FCM + APNs | Mobile alerts |
| Email | SendGrid | Weekly reports, onboarding |
| SMS / OTP | Twilio / MSG91 | Phone verification |
| Festival Calendar | Custom + Google Calendar API | Context event data |

---

## 🔄 Data Pipeline

```
STEP 1: DATA INGESTION
═══════════════════════
User grants AA consent
        │
        ▼
Account Aggregator (Setu/Finvu)
  → Fetches bank statements
  → Fetches UPI transaction history
  → Streams new transactions via webhook
        │
        ▼
Kafka Topic: raw_transactions
        │
        ▼

STEP 2: TRANSACTION PROCESSING
════════════════════════════════
Transaction Consumer (Python Worker)
        │
        ├── Deduplicate (Redis bloom filter)
        │
        ├── Normalize schema
        │     {id, user_id, amount, timestamp,
        │      merchant_name, upi_ref, raw_description}
        │
        ├── Enrich (merchant lookup DB)
        │
        └── Push to Kafka: enriched_transactions
                │
                ▼

STEP 3: AI CLASSIFICATION
══════════════════════════
ML Classification Worker
        │
        ├── Run DistilBERT classifier on merchant + description
        │     → Category: Food / Transport / Shopping /
        │                  Bills / Entertainment / Health / Other
        │
        ├── Confidence score > 0.85? → Auto-assign
        │   Confidence score < 0.85? → Flag for user confirmation
        │
        └── Store classified transaction → PostgreSQL
                │
                ▼

STEP 4: PATTERN ANALYSIS
══════════════════════════
Analytics Worker (runs every 15 min)
        │
        ├── Update rolling aggregates (daily / weekly / monthly)
        │
        ├── Run Isolation Forest anomaly detection
        │     → Flag transactions > 2σ from personal baseline
        │
        ├── Evaluate goal progress
        │     → Calculate burn rate vs goal timeline
        │
        └── Push events to Kafka: analytics_events
                │
                ▼

STEP 5: CONTEXT ENGINE
══════════════════════════
Context Processor (runs daily at 6 AM)
        │
        ├── Fetch upcoming calendar events (festivals, holidays)
        │
        ├── Cross-reference user spending history
        │     → "Last Diwali you spent ₹8,200 extra"
        │
        ├── Generate context signals
        │     {event_type, days_ahead, historical_spend, priority}
        │
        └── Merge with analytics_events → alert_candidates
                │
                ▼

STEP 6: ALERT & ADVICE GENERATION
════════════════════════════════════
AI Advisor Worker
        │
        ├── Filter alert_candidates by priority threshold
        │
        ├── Call LLM API with:
        │     - User spending summary (last 30 days)
        │     - Anomalies detected
        │     - Context signals
        │     - Goal status
        │     → Generate natural language advice
        │
        ├── Priority tag: Low / Medium / High / Critical
        │
        └── Push to Notification Service
                │
                ▼

STEP 7: DELIVERY
══════════════════
Notification Service
        │
        ├── In-app notification (WebSocket → real-time)
        ├── Push notification (FCM / APNs)
        └── Weekly digest email (SendGrid, every Sunday 9 AM)
```

---

## 🤖 AI & ML Pipeline

### Transaction Classifier

```python
# Model: Fine-tuned DistilBERT on Indian transaction descriptions
# Training data: 500K+ labeled Indian UPI transactions

Pipeline:
  Input: "SWIGGY*ORDER#12345" + amount ₹340
      │
      ▼
  Preprocessing:
    - Normalize merchant name
    - Remove special chars, order IDs
    - Lowercase + tokenize
      │
      ▼
  DistilBERT Inference:
    - Output: category logits
    - Softmax → probability distribution
      │
      ▼
  Post-processing:
    - Top-1 category if confidence > 0.85
    - Top-3 suggestions if confidence 0.60–0.85
    - "Uncategorized" + user prompt if < 0.60
      │
      ▼
  Output: { category: "Food", confidence: 0.94 }
```

### AI Spending Advisor (LLM)

```
System Prompt Template:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are FinSight, a personal finance advisor for young 
Indians. Be direct, warm, and specific. Always give a 
concrete ₹ amount as recommendation. Never use jargon.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Context Injected:
  - Monthly income estimate (derived from credits)
  - Category-wise spend (last 30 days)
  - Anomalies (vs personal 90-day baseline)
  - Active savings goals + progress %
  - Upcoming context events (next 14 days)
  - Previous advice (avoid repetition)

Output Format (JSON):
  {
    "advice": "You spent ₹4,100 on food delivery...",
    "action": "Cut 3 Swiggy orders this week → save ₹800",
    "priority": "medium",
    "category": "food",
    "potential_saving": 800
  }
```

### Context-Aware Alert Engine

```
Inputs:
  ├── Indian festival calendar (100+ events/year)
  ├── User location (city-level for regional festivals)
  ├── User's historical spend around same event last year
  ├── Current month's spending trajectory
  └── User-defined life events (birthday, rent due)

Logic:
  if (days_until_event <= 7 AND event_type == "major_festival"):
      generate_budget_alert(historical_spend * 1.1)
      priority = "medium"

  if (current_spend / monthly_budget >= 0.8 AND days_remaining >= 8):
      generate_budget_warning()
      priority = "high"

  if (impulse_transactions_this_week >= 3):
      generate_impulse_alert()
      priority = "high"

  if (emergency_event_detected):  # via news/API
      generate_essential_only_alert()
      priority = "critical"
```

---

## 🗄️ Database Schema

```sql
-- USERS
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(15) UNIQUE NOT NULL,
    email           VARCHAR(255),
    name            VARCHAR(100),
    city            VARCHAR(50),
    income_estimate INTEGER,             -- derived, not asked
    aa_consent_id   VARCHAR(255),        -- Account Aggregator consent handle
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    amount          DECIMAL(12, 2) NOT NULL,
    type            VARCHAR(10) CHECK (type IN ('debit','credit')),
    category        VARCHAR(50),
    category_confidence DECIMAL(4,3),
    merchant_name   VARCHAR(255),
    upi_ref_id      VARCHAR(100),
    bank_ref_id     VARCHAR(100),
    description     TEXT,
    transaction_at  TIMESTAMPTZ NOT NULL,
    source          VARCHAR(20),         -- 'upi', 'receipt', 'manual'
    receipt_id      UUID,
    is_flagged      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_txn_user_date ON transactions(user_id, transaction_at DESC);
CREATE INDEX idx_txn_category ON transactions(user_id, category);

-- SAVINGS GOALS
CREATE TABLE goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(100) NOT NULL,
    target_amount   DECIMAL(12,2) NOT NULL,
    current_amount  DECIMAL(12,2) DEFAULT 0,
    deadline        DATE,
    status          VARCHAR(20) DEFAULT 'active',
    ai_plan         JSONB,               -- AI-generated savings plan
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RECEIPTS
CREATE TABLE receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    file_url        VARCHAR(500),        -- S3 URL
    raw_text        TEXT,                -- OCR output
    parsed_data     JSONB,               -- extracted line items
    gst_number      VARCHAR(20),
    gst_valid       BOOLEAN,
    total_amount    DECIMAL(12,2),
    merchant_name   VARCHAR(255),
    receipt_date    DATE,
    status          VARCHAR(20) DEFAULT 'processing',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ALERTS
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    type            VARCHAR(50),         -- 'festival','budget','impulse', etc.
    message         TEXT,
    action_text     TEXT,
    priority        VARCHAR(10) CHECK (priority IN ('low','medium','high','critical')),
    context_event   VARCHAR(100),
    is_read         BOOLEAN DEFAULT FALSE,
    is_dismissed    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- WEEKLY REPORTS
CREATE TABLE weekly_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    week_start      DATE NOT NULL,
    week_end        DATE NOT NULL,
    total_spent     DECIMAL(12,2),
    category_breakdown JSONB,
    top_insight     TEXT,
    ai_summary      TEXT,
    recommendations JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SPENDING AGGREGATES (materialized, updated every 15 min)
CREATE TABLE spending_aggregates (
    user_id         UUID REFERENCES users(id),
    period_type     VARCHAR(10),         -- 'daily','weekly','monthly'
    period_start    DATE,
    category        VARCHAR(50),
    total_amount    DECIMAL(12,2),
    transaction_count INTEGER,
    avg_per_txn     DECIMAL(10,2),
    PRIMARY KEY (user_id, period_type, period_start, category)
);
```

---

## 🔌 API Reference

### Authentication
```
POST   /api/v1/auth/send-otp          Send OTP to phone
POST   /api/v1/auth/verify-otp        Verify OTP → returns JWT
POST   /api/v1/auth/refresh           Refresh access token
DELETE /api/v1/auth/logout            Invalidate session
```

### Transactions
```
GET    /api/v1/transactions           List transactions (paginated, filterable)
GET    /api/v1/transactions/:id       Get single transaction detail
PATCH  /api/v1/transactions/:id       Update category (user correction)
GET    /api/v1/transactions/summary   Aggregated spend summary
GET    /api/v1/transactions/search    Full-text search
```

### Dashboard
```
GET    /api/v1/dashboard              Full dashboard snapshot
GET    /api/v1/dashboard/trends       Spending trends (daily/weekly/monthly)
GET    /api/v1/dashboard/categories   Category-wise breakdown + charts data
GET    /api/v1/dashboard/insights     Top AI-generated insights
```

### Goals
```
GET    /api/v1/goals                  List all goals
POST   /api/v1/goals                  Create new goal
GET    /api/v1/goals/:id              Goal detail + progress + AI plan
PATCH  /api/v1/goals/:id              Update goal
DELETE /api/v1/goals/:id              Delete goal
GET    /api/v1/goals/:id/suggestions  AI-suggested spending cuts for goal
```

### Receipts
```
POST   /api/v1/receipts/upload        Upload receipt (multipart/form-data)
GET    /api/v1/receipts               List parsed receipts
GET    /api/v1/receipts/:id           Receipt detail + parsed line items
PATCH  /api/v1/receipts/:id/confirm   Confirm/edit parsed data
```

### Alerts
```
GET    /api/v1/alerts                 List alerts (unread first)
PATCH  /api/v1/alerts/:id/read        Mark as read
PATCH  /api/v1/alerts/:id/dismiss     Dismiss alert
GET    /api/v1/alerts/active          Active high-priority alerts only
```

### AI Advisor
```
POST   /api/v1/ai/advice              Request on-demand AI advice
GET    /api/v1/ai/weekly-report       Latest weekly AI report
POST   /api/v1/ai/chat                Conversational finance Q&A
GET    /api/v1/ai/predictions         Spending predictions for next 7 days
```

### Account Aggregator
```
POST   /api/v1/aa/consent/initiate    Start AA consent flow
GET    /api/v1/aa/consent/status      Check consent status
POST   /api/v1/aa/sync                Manual sync trigger
GET    /api/v1/aa/linked-accounts     List all linked bank accounts
DELETE /api/v1/aa/consent/revoke      Revoke AA consent
```

---

## 📁 Project Structure

```
finsight/
│
├── 📱 apps/
│   ├── mobile/                        # React Native app
│   │   ├── src/
│   │   │   ├── screens/               # Dashboard, Goals, Receipts, Alerts
│   │   │   ├── components/            # Reusable UI components
│   │   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── store/                 # Zustand state stores
│   │   │   ├── services/              # API client layer
│   │   │   └── utils/                 # Formatters, helpers
│   │   └── package.json
│   │
│   └── web/                           # React web dashboard
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── ...
│       └── package.json
│
├── 🔧 services/
│   ├── api/                           # FastAPI core backend
│   │   ├── app/
│   │   │   ├── routers/               # Route handlers per domain
│   │   │   ├── models/                # SQLAlchemy ORM models
│   │   │   ├── schemas/               # Pydantic request/response schemas
│   │   │   ├── services/              # Business logic layer
│   │   │   ├── dependencies/          # Auth, DB session injection
│   │   │   └── main.py
│   │   ├── tests/
│   │   └── requirements.txt
│   │
│   ├── auth/                          # Node.js auth service
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   └── utils/otp.js
│   │   └── package.json
│   │
│   ├── ai/                            # Python AI/ML service
│   │   ├── classifier/                # Transaction categorization
│   │   │   ├── model/                 # Fine-tuned DistilBERT weights
│   │   │   ├── train.py
│   │   │   └── inference.py
│   │   ├── advisor/                   # LLM-based advice engine
│   │   │   ├── prompt_templates/
│   │   │   └── advisor.py
│   │   ├── context_engine/            # Festival + event detection
│   │   │   ├── calendar_data/         # Indian festival calendar JSON
│   │   │   └── context_processor.py
│   │   ├── anomaly/                   # Isolation Forest detector
│   │   │   └── detector.py
│   │   └── receipt_parser/            # OCR + GST parser
│   │       ├── ocr.py
│   │       └── gst_validator.py
│   │
│   ├── ingestion/                     # Transaction ingestion worker
│   │   ├── aa_client/                 # Account Aggregator SDK wrapper
│   │   ├── kafka_consumer.py
│   │   └── processor.py
│   │
│   └── notifications/                 # Node.js notification service
│       ├── src/
│       │   ├── fcm.js                 # Firebase push
│       │   ├── email.js               # SendGrid weekly reports
│       │   └── scheduler.js           # Cron jobs for weekly reports
│       └── package.json
│
├── 🗄️ infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml         # Local development
│   │   ├── docker-compose.prod.yml    # Production overrides
│   │   └── Dockerfiles per service
│   │
│   ├── k8s/                           # Kubernetes manifests
│   │   ├── deployments/
│   │   ├── services/
│   │   ├── ingress/
│   │   └── configmaps/
│   │
│   ├── terraform/                     # AWS infrastructure as code
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── modules/
│   │
│   └── scripts/
│       ├── db_migrate.sh
│       ├── seed_dev.sh
│       └── deploy.sh
│
├── 📊 data/
│   ├── festivals/                     # Indian festival calendar data
│   ├── merchant_lookup/               # Merchant name → category DB
│   └── ml_training/                   # Training dataset (gitignored)
│
├── 📋 docs/
│   ├── api/                           # OpenAPI/Swagger specs
│   ├── architecture/                  # Architecture diagrams
│   └── decisions/                     # Architecture Decision Records (ADRs)
│
├── 🧪 tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # Test on every PR
│       └── deploy.yml                 # Deploy on merge to main
│
├── docker-compose.yml                 # Root compose for local dev
├── Makefile                           # Dev shortcuts
└── README.md                          # This file
```

---

## 🚀 Getting Started

### Prerequisites

```bash
# Required
Node.js >= 18.0
Python >= 3.11
Docker + Docker Compose
PostgreSQL 15 (or use Docker)
Redis 7 (or use Docker)

# Optional for mobile
Expo CLI
Android Studio / Xcode
```

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/finsight.git
cd finsight
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
# Edit .env with your values (see Environment Variables section)
```

### 3. Start All Services with Docker

```bash
# Start databases, kafka, redis
docker-compose up -d postgres redis kafka zookeeper

# Run database migrations
make db-migrate

# Seed development data
make db-seed

# Start all backend services
docker-compose up -d api auth ai ingestion notifications
```

### 4. Start Frontend

```bash
# Web dashboard
cd apps/web
npm install
npm run dev
# → http://localhost:3000

# Mobile app
cd apps/mobile
npm install
npx expo start
# → Scan QR with Expo Go app
```

### 5. Verify Everything is Running

```bash
make health-check

# Expected output:
# ✅ PostgreSQL     → healthy
# ✅ Redis          → healthy
# ✅ Kafka          → healthy
# ✅ API Service    → healthy (http://localhost:8000)
# ✅ Auth Service   → healthy (http://localhost:8001)
# ✅ AI Service     → healthy (http://localhost:8002)
# ✅ Web App        → healthy (http://localhost:3000)
```

### Useful Make Commands

```bash
make dev          # Start all services in dev mode
make test         # Run all tests
make db-migrate   # Run pending migrations
make db-seed      # Seed dev data
make logs         # Tail all service logs
make shell-api    # Bash into API container
make clean        # Stop and remove all containers
```

---

## 🔐 Environment Variables

```bash
# ─── Database ──────────────────────────────────────
DATABASE_URL=postgresql://finsight:password@localhost:5432/finsight
REDIS_URL=redis://localhost:6379

# ─── Auth ──────────────────────────────────────────
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
OTP_EXPIRY_SECONDS=300

# ─── AI Services ───────────────────────────────────
OPENAI_API_KEY=sk-...                # Or use Anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=gpt-4o                      # or claude-3-5-sonnet-20241022
CLASSIFIER_MODEL_PATH=./models/distilbert-finsight-v1

# ─── Account Aggregator ────────────────────────────
AA_PROVIDER=setu                     # setu | finvu | onemoney
SETU_CLIENT_ID=your_setu_client_id
SETU_CLIENT_SECRET=your_setu_secret
SETU_ENVIRONMENT=sandbox             # sandbox | production

# ─── Notifications ─────────────────────────────────
FCM_SERVER_KEY=your_firebase_server_key
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_apple_team_id
SENDGRID_API_KEY=SG.your_key

# ─── Storage ───────────────────────────────────────
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET_NAME=finsight-receipts
S3_REGION=ap-south-1

# ─── OCR ───────────────────────────────────────────
GOOGLE_VISION_API_KEY=your_vision_key

# ─── Kafka ─────────────────────────────────────────
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=finsight-consumers

# ─── App ───────────────────────────────────────────
NODE_ENV=development
LOG_LEVEL=debug
PORT=8000
CORS_ORIGINS=http://localhost:3000
```

---

## 🗺️ Development Roadmap

### ✅ Phase 0 — Foundation *(Weeks 1–4)*
- [ ] Project scaffold (monorepo, Docker setup)
- [ ] PostgreSQL schema + migrations
- [ ] Auth service (phone OTP + JWT)
- [ ] Basic transaction CRUD API
- [ ] Manual transaction entry (mobile)
- [ ] Simple dashboard (bar chart + list)

### 🚧 Phase 1 — Core Intelligence *(Weeks 5–10)*
- [ ] DistilBERT classifier training + integration
- [ ] AA sandbox integration (Setu)
- [ ] Auto-transaction ingestion pipeline
- [ ] Kafka event streaming setup
- [ ] Spending aggregates + trend API
- [ ] Basic alert system (budget threshold)

### 🔮 Phase 2 — AI Features *(Weeks 11–16)*
- [ ] LLM-based spending advisor
- [ ] Context-aware alert engine
- [ ] Festival calendar integration
- [ ] Goal-based saving system with AI plan
- [ ] Receipt upload + OCR parser
- [ ] GST validation engine
- [ ] Weekly AI report generation + email

### 🚀 Phase 3 — Polish & Scale *(Weeks 17–22)*
- [ ] React Native mobile app (iOS + Android)
- [ ] Push notifications (FCM + APNs)
- [ ] Real-time dashboard via WebSockets
- [ ] Multi-bank / cross-UPI support
- [ ] Anomaly detection (Isolation Forest)
- [ ] Performance optimization + caching
- [ ] Load testing + security audit

### 🌟 Phase 4 — Growth *(Month 6+)*
- [ ] Hindi + regional language support
- [ ] B2B white-label API
- [ ] Family plan + shared dashboard
- [ ] Business GST reporting module
- [ ] Investment recommendation integrations (MF, SIP)
- [ ] Series A fundraise readiness

---

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines before submitting PRs.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
# Open a Pull Request
```

### Code Standards
- **Python:** PEP 8 + Black formatter + type hints required
- **TypeScript/JS:** ESLint + Prettier + strict mode
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)
- **Tests:** Minimum 80% coverage on new features
- **PRs:** Must include a description, test evidence, and reviewer assignment

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for Young India**

*Making financial clarity as easy as making a UPI payment.*

---

*FinSight — See your money. Understand your money. Control your money.*

</div>
