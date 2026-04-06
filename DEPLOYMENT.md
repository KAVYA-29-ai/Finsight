# Finsight Deployment Guide

Complete step-by-step guide to deploy **PhonePe** and **FinSight** apps on Vercel.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Repository Setup](#repository-setup)
3. [Vercel Project Creation](#vercel-project-creation)
4. [Environment Variables](#environment-variables)
5. [Deploy & Verify](#deploy--verify)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ GitHub account (repo already connected)
- ✅ Vercel account (free tier sufficient)
- ✅ Supabase account + configured database
- ✅ Google Gemini API key

### Required Keys/URLs

Get these before starting deployment:

#### Supabase
1. Go to [supabase.com](https://supabase.com) → Project Settings
2. Copy:
   - `SUPABASE_URL` (from API section)
   - `SUPABASE_ANON_KEY` (Public API Key)
   - `SUPABASE_SERVICE_ROLE_KEY` (Secret)
   - `SUPABASE_DB_URL` (Database URL, if needed)

#### Gemini API
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create API key
3. Copy `GEMINI_API_KEY`

---

## Repository Setup

### 1. Verify `.env` is NOT tracked

```bash
cd /workspaces/Finsight
git status

# Expected output:
# On branch main
# nothing to commit, working tree clean
```

`.env` file contains real secrets and MUST NOT be in git history.

✅ **Already done:** Root `.env` removed from tracking

### 2. Commit & Push

```bash
git add -A
git commit -m "chore: add vercel deploy config and tests

- Add vercel.json for both apps
- Add smoke tests for deployment validation
- Secure env handling with .gitignore
"
git push origin main
```

---

## Vercel Project Creation

### Option 1: Deploy via Vercel Dashboard (Recommended)

#### Step 1: Import PhonePe Project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Continue with GitHub"**
3. Select **Finsight** repository
4. Configure:
   - **Project Name:** `finsight-phonepe` (or your choice)
   - **Framework Preset:** `Vite`
   - **Root Directory:** `phonepe/`
   - **Build Command:** Override if needed → `npm run build`
   - **Output Directory:** `dist`
5. Click **Deploy**

#### Step 2: Import FinSight Project

1. Go back to [vercel.com/new](https://vercel.com/new)
2. Import same **Finsight** repo again (different project)
3. Configure:
   - **Project Name:** `finsight-dashboard` (or your choice)
   - **Framework Preset:** `Vite`
   - **Root Directory:** `finsight/`
   - **Build Command:** Override if needed → `npm run build`
   - **Output Directory:** `dist`
4. Click **Deploy**

---

## Environment Variables

### PhonePe App (API + UI)

1. Go to Vercel Dashboard → **finsight-phonepe** project
2. Click **Settings** → **Environment Variables**
3. Add the following variables (for all environments):

```
PHONEPE_PORT=3000
SUPABASE_URL=https://mpdawhmfiqeyfxbsuxeq.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Steps per variable:**
- Variable Name: `PHONEPE_PORT` → Value: `3000` → Select all environments → Save
- Repeat for other variables

### FinSight App (Dashboard + Analytics)

1. Go to Vercel Dashboard → **finsight-dashboard** project
2. Click **Settings** → **Environment Variables**
3. Add the following variables (for all environments):

```
FINSIGHT_PORT=3001
FINSIGHT_SOURCE_LABEL=shared-phonepe-state
SUPABASE_URL=https://mpdawhmfiqeyfxbsuxeq.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=AIzaSyD7...
GEMINI_MODEL=gemini-3-flash-preview
```

---

## Deploy & Verify

### Automatic Deployment

✅ **Already configured:** Vercel auto-deploys on `git push origin main`

Every push triggers:
1. Build from source
2. Run tests
3. Deploy to production

### Manual Trigger (if needed)

1. Vercel Dashboard → Select project
2. Click **Deployments**
3. Find latest deployment → Click **Redeploy**

### Verify Deployments

#### Check Build Success
```
Vercel Dashboard → Deployments → Click latest deployment
Expected status: ✅ Ready (green)
```

#### Test PhonePe App
```
https://finsight-phonepe.vercel.app
```

#### Test FinSight App
```
https://finsight-dashboard.vercel.app
```

#### Quick Health Check
```bash
# From your local machine
curl -s https://finsight-phonepe.vercel.app/api/supabase/health | jq .

# Expected response:
# {
#   "connected": true,
#   "message": "Supabase connected",
#   "db": "Connected"
# }
```

---

## Troubleshooting

### Build Fails: "Cannot find module"

**Cause:** Missing dependency in package.json
  
**Fix:**
```bash
# In root
npm install
npm run build -w phonepe
npm run build -w finsight

# Commit changes
git add package-lock.json
git commit -m "chore: update dependencies"
git push
```

### 502 Bad Gateway on API calls

**Cause:** Server logic issue or missing env vars
  
**Debug:**
```bash
# 1. Check Vercel env variables are set
Vercel Dashboard → Settings → Environment Variables

# 2. Check server logs
Vercel Dashboard → Deployments → Click deployment → Function Logs

# 3. For local testing
node phonepe/server.js
curl http://localhost:3000/api/supabase/health
```

### "Cannot connect to Supabase"

**Cause:** Missing or incorrect `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
  
**Fix:**
1. Verify keys in Vercel Settings
2. Test locally:
   ```bash
   SUPABASE_URL="..." npm run supabase:health
   ```
3. Re-deploy after fixing env vars

### Tests Fail in Vercel

**Cause:** Tests can't find config files in build environment
  
**Current Status:** ✅ Tests are optional (not blocking deploy)
  
**To make tests required:**
```bash
# Modify package.json buildCommand
"build": "npm run test && npm run build"
```

---

## Project URLs After Deployment

| Service | URL | Purpose |
|---------|-----|---------|
| PhonePe App | `https://finsight-phonepe.vercel.app` | Wallet UI + API |
| FinSight App | `https://finsight-dashboard.vercel.app` | Analytics Dashboard |
| GitHub Repo | `https://github.com/KAVYA-29-ai/Finsight` | Source Code |

---

## Quick Commands Reference

### Local Development
```bash
# Install dependencies
npm install

# Run both apps locally
npm run dev

# Run PhonePe only
npm run dev:phonepe

# Run FinSight only
npm run dev:finsight

# Build for production
npm run build

# Run tests
npm run test
```

### Git & Deploy
```bash
# Stage & commit changes
git add -A
git commit -m "your message"

# Deploy to Vercel
git push origin main

# Check deployment status
git log --oneline -5
```

---

## Security Checklist

Before each deployment:

- ✅ `.env` is NOT in git (`git ls-files | grep .env`)
- ✅ Only `.env.example` has template values
- ✅ All secrets in Vercel ENV variables, not in code
- ✅ `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are kept private
- ✅ `.gitignore` includes `node_modules/`, `.vercel/`

---

## Environment Variable Reference

### All Available Variables

```
# Port Configuration
PHONEPE_PORT=3000
FINSIGHT_PORT=3001

# Application State
FINSIGHT_SOURCE_LABEL=shared-phonepe-state

# Supabase (Database)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
SUPABASE_DB_URL=postgresql://user:pass@host/db

# Google Gemini (AI)
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3-flash-preview
```

---

## Need Help?

| Issue | Solution |
|-------|----------|
| Deployment stuck | Check Vercel Dashboard → Function Logs |
| App not loading | Verify `.vercel.json` config in app directory |
| API 503 error | Check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in prod env |
| Build timeout | Increase vercel timeout in `vercel.json` |

---

**Last Updated:** April 6, 2026  
**Verified:** ✅ Both apps tested locally and build-validated for Vercel
