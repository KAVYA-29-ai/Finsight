# Finsight Deployment Guide

Complete step-by-step guide to deploy **PhonePe** and **FinSight** with proper architecture:
- **Frontend (UI):** Vercel (static build)
- **API (Node.js):** Railway (Node.js hosting)
- **Database:** Supabase

---

## 🏗️ Why This Architecture?

**Problem:** Vercel doesn't run Node.js servers (like `server.js`), only static files.  
**Solution:** Deploy frontend to Vercel + API to Railway with CORS enabled.

```
User Browser
     ↓
  Vercel (Frontend) ←→ Railway (API) ←→ Supabase
```

---

## Table of Contents
1. [Part 1: Frontend Deployment (Vercel)](#part-1-frontend-deployment-vercel)
2. [Part 2: API Deployment (Railway)](#part-2-api-deployment-railway)
3. [Part 3: Connect Frontend to API](#part-3-connect-frontend-to-api)
4. [Testing & Verification](#testing--verification)
5. [Troubleshooting](#troubleshooting)



---

## Prerequisites

### Required Accounts
- ✅ GitHub account (repo already connected)
- ✅ Vercel account (free tier)
- ✅ Railway account ([railway.app](https://railway.app))
- ✅ Supabase account + database
- ✅ Google Gemini API key

### Required Keys (Get Before Starting!)

**Supabase:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1...
```

**Gemini:**
```
GEMINI_API_KEY=AIzaSyD7...
```

---

## Part 1: Frontend Deployment (Vercel)

### Step 1.1: Deploy PhonePe Frontend

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Continue with GitHub"**
3. Select **Finsight** repository
4. Configure:
   - **Project Name:** `finsight-phonepe`
   - **Framework Preset:** `Vite`
   - **Root Directory:** `phonepe/`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Click **Deploy** and wait ✅

### Step 1.2: Deploy FinSight Frontend

1. Go back to [vercel.com/new](https://vercel.com/new)
2. Click **"Continue with GitHub"**
3. Select **Finsight** repository again
4. Configure:
   - **Project Name:** `finsight-dashboard`
   - **Framework Preset:** `Vite`
   - **Root Directory:** `finsight/`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Click **Deploy** and wait ✅

**After deployment:**
```
PhonePe Frontend: https://finsight-phonepe.vercel.app
FinSight Frontend: https://finsight-dashboard.vercel.app
```

note: Will show errors until API deployed (step 2) ⚠️

---

## Part 2: API Deployment (Railway)

Railway is where we run the Node.js servers (`phonepe/server.js` and `finsight/server.js`).

### Step 2.1: Deploy PhonePe API

1. Go to [railway.app/dashboard](https://railway.app/dashboard)
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose **Finsight** repository
5. Configure:
   - **Root Directory:** `phonepe/` 
   - **Build Command:** (leave empty, uses Procfile)
   - **Start Command:** `node server.js`
6. Click **Deploy**

### Step 2.2: Set PhonePe Environment Variables (Railway)

1. In Railway Dashboard → Your PhonePe project
2. Go to **Variables** tab
3. Add these variables:

```
PHONEPE_PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. Click **Deploy** (Railway auto-redeploys)

### Step 2.3: Get PhonePe API URL

1. Railway Dashboard → PhonePe project
2. Go to **Deployments** tab
3. Click latest deployment → **Public URL**
4. Copy this URL

**This is your `PHONEPE_API_URL`** (save it, need in step 3)

### Step 2.4: Deploy FinSight API

Repeat 2.1-2.3 but:
- Root Directory: `finsight/`
- Environment Variables:

```
FINSIGHT_PORT=3001
FINSIGHT_SOURCE_LABEL=shared-phonepe-state
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=AIzaSyD7Di2XsfOXefEwQW2qSK9zkqSDG6sn0cw
GEMINI_MODEL=gemini-3-flash-preview
```

Note: Copy **FINSIGHT_API_URL** from public URL (save it)

---

## Part 3: Connect Frontend to API

Now we tell Vercel where the APIs are.

### Step 3.1: Set PhonePe Frontend Environment Variables

1. Vercel Dashboard → **finsight-phonepe** project
2. Go to **Settings** → **Environment Variables**
3. Add:

```
VITE_PHONEPE_API_URL=https://phonepe-api-xxxxx.railway.app
```

**Important:** Use `VITE_` prefix so Vite includes it in the build

4. **Important:** Click **Redeploy** (Deployments tab) to rebuild with new env var

### Step 3.2: Set FinSight Frontend Environment Variables

1. Vercel Dashboard → **finsight-dashboard** project
2. Go to **Settings** → **Environment Variables**
3. Add:

```
VITE_FINSIGHT_API_URL=https://finsight-api-yyyyy.railway.app
```

**Important:** Use `VITE_` prefix so Vite includes it in the build

4. **Important:** Click **Redeploy** (Deployments tab) to rebuild with new env var

---

## Testing & Verification

### Test 1: API Health Check

```bash
curl https://phonepe-api-xxxxx.railway.app/api/supabase/health 
```

Should return:
```json
{ "ok": true, "data": { "connected": true } }
```

### Test 2: Load Frontend

Visit:
```
https://finsight-phonepe.vercel.app
https://finsight-dashboard.vercel.app
```

Should show: UI loads, no JSON errors ✅

### Test 3: Data Flows

1. Open DevTools (F12)
2. Go to **Network** tab
3. Click "Refresh Data" button
4. Check API calls succeed (status 200) ✅

---

## Environment Variables

### PhonePe App

| Location | Variable | Value |
|----------|----------|-------|
| Vercel | `VITE_PHONEPE_API_URL` | `https://phonepe-api-xxxxx.railway.app` |
| Railway | `PHONEPE_PORT` | `3000` |
| Railway | `SUPABASE_URL` | `https://your-project.supabase.co` |
| Railway | `SUPABASE_ANON_KEY` | *(from Supabase)* |
| Railway | `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase)* |

### FinSight App

| Location | Variable | Value |
|----------|----------|-------|
| Vercel | `VITE_FINSIGHT_API_URL` | `https://finsight-api-yyyyy.railway.app` |
| Railway | `FINSIGHT_PORT` | `3001` |
| Railway | `SUPABASE_URL` | `https://your-project.supabase.co` |
| Railway | `SUPABASE_ANON_KEY` | *(from Supabase)* |
| Railway | `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase)* |
| Railway | `GEMINI_API_KEY` | *(from Google)* |
| Railway | `GEMINI_MODEL` | `gemini-3-flash-preview` |

---

## Troubleshooting

### "Unexpected token '<', "<!doctype..."

**Problem:** Frontend trying to call API that's down or using wrong URL

**Check:**
1. Is Railway API deployed and running?
```bash
curl https://phonepe-api-xxxxx.railway.app/api/supabase/health
```

2. Is Vercel env variable set with `VITE_` prefix?
```
Vercel → Settings → Environment Variables 
Check: VITE_PHONEPE_API_URL or VITE_FINSIGHT_API_URL exists
```

3. Did you redeploy Vercel after adding env vars?
```
Vercel → Deployments → Redeploy latest
```

**Fix:**
- Add `VITE_PHONEPE_API_URL=https://railway-url...` to Vercel
- **Must** use `VITE_` prefix (without it, env var won't be available in frontend)
- Redeploy Vercel frontend
- Wait 2-3 minutes
- Refresh browser cache (Ctrl+Shift+R)

### CORS Error in Console

**Status:** ✅ Fixed in code (CORS headers added to server.js)

**If still happening:**
```bash
# Redeploy API with latest code
git pull origin main
# Railway auto-redeploys on git push
```

### Cannot Connect to Supabase

**Debug:**
```bash
# Test API locally
node finsight/server.js

#Check  Supabase connection
curl http://localhost:3001/api/supabase/health
```

**Fix:**
1. Verify SUPABASE_URL correct
2. Verify SUPABASE_SERVICE_ROLE_KEY correct
3. Check Supabase project is active
4. Redeploy Railway app

### 503 Supabase Not Configured

**Cause:** Missing env variables in Railway

**Fix:**
1. Railway Dashboard → Variables
2. Add all required vars
3. Click Deploy
4. Wait 2-3 minutes for restart

### Build Fails on Vercel

**Fix:**
```bash
npm install
git add package-lock.json
git commit -m "fix: update dependencies"
git push origin main
```

---

## Project URLs After Full Deployment

| Service | URL | Type |
|---------|-----|------|
| PhonePe Frontend | https://finsight-phonepe.vercel.app | Vercel |
| FinSight Frontend | https://finsight-dashboard.vercel.app | Vercel |
| PhonePe API | https://phonepe-api-xxxxx.railway.app | Railway |
| FinSight API | https://finsight-api-yyyyy.railway.app | Railway |
| Supabase DB | https://your-project.supabase.co | Supabase |

---

## Deployment Checklist

- [ ] PhonePe frontend deployed on Vercel
- [ ] FinSight frontend deployed on Vercel
- [ ] PhonePe API deployed on Railway
- [ ] FinSight API deployed on Railway
- [ ] Railway env variables set (Supabase + Gemini keys)
- [ ] Vercel env variables set (API URLs)
- [ ] Both frontends redeployed after adding API URLs
- [ ] API health checks pass
- [ ] Frontend loads without JSON errors
- [ ] Data flows from UI to API to Supabase

---

## Local Testing Before Deployment

### 1. Both APIs Running Locally

```bash
# Terminal 1: PhonePe API
cd phonepe
node server.js

# Terminal 2: FinSight API
cd finsight
node server.js

# Terminal 3: Frontend apps
npm run dev
```

### 2. Test API Health

```bash
curl http://localhost:3000/api/supabase/health
curl http://localhost:3001/api/supabase/health
```

### 3. Test Frontend

- Open http://localhost:5173 (PhonePe)
- Open http://localhost:5174 (FinSight)
- Click "Refresh Data" button
- **Check Network tab:**
  - All API calls should be 200
  - Data should display without JSON errors

---

## Quick Reference

### Vercel Environment Variables (Frontend)

**Important:** Use `VITE_` prefix! Without it, env vars won't be available in frontend build.

```
VITE_PHONEPE_API_URL=https://phonepe-api-xxxxx.railway.app
VITE_FINSIGHT_API_URL=https://finsight-api-yyyyy.railway.app
```

### Railway Environment Variables (API)

```
PHONEPE_PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=AIzaSyD7Di2XsfOXefEwQW2qSK9zkqSDG6sn0cw
GEMINI_MODEL=gemini-3-flash-preview
```

### Manual Redeploy Steps

**Vercel:**
1. Dashboard → Project
2. Deployments tab
3. Find latest → Redeploy

**Railway:**
1. Dashboard → Project
2. Deployments tab
3. Redeploy latest

---

## Key Files Added for Deployment

- `phonepe/Procfile` - tells Railway how to start PhonePe server
- `phonepe/railway.json` - Railway config for PhonePe
- `phonepe/vercel.json` - Vercel config for PhonePe frontend
- `finsight/Procfile` - tells Railway how to start FinSight server
- `finsight/railway.json` - Railway config for FinSight
- `finsight/vercel.json` - Vercel config for FinSight frontend
- `.env.example` - shows all required env variable template

All include CORS headers so frontend can call API from different domain ✅

---

**Last Updated:** April 6, 2026  
**Deployment Method:** Vercel (Frontend) + Railway (API) + Supabase (Database)  
**Status:** ✅ Ready to deploy
