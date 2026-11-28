# Rice Farm Registry and Georeferencing System (Silago MAO)

Official Rice Farm Registry and Georeferencing Geographic Information System for the Municipal Agriculture Office (MAO) of Silago, Southern Leyte, with LFT (Local Farmer Technician) field management and real-time Supabase database synchronization.

---

## 🚀 Deployment Guide

### Option 1: Push to GitHub & Deploy to Vercel (Recommended)

#### Step 1: Initialize Git and Push to GitHub
If you haven't pushed this project to GitHub yet, run the following in your project terminal:

```bash
git init
git add .
git commit -m "Initial commit: Rice Farm Registry and Georeferencing System"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

#### Step 2: Deploy to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/new).
2. Click **"Add New Project"** and import your GitHub repository.
3. Vercel will automatically detect the settings:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Add the following **Environment Variables** in the Vercel project settings:
   - `VITE_SUPABASE_URL` = Your Supabase Project URL (e.g. `https://wqfledwavyqtlgnpgvoi.supabase.co` or from your project)
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase Anon / Public API Key
   - `GEMINI_API_KEY` = Your Google Gemini API Key (optional, for RiceSsistant AI Chatbot)
5. Click **Deploy**.

#### Supabase staff setup

1. In **Authentication → Users**, create or invite the Central Admin
   (`admin@gmail.com`), and confirm the account email.
2. On the existing project, apply [supabase_schema.sql](supabase_schema.sql)
   and then the [staff accounts migration](supabase/migrations/20261128052124_staff_accounts.sql)
   in the Supabase SQL Editor before deploying the updated client. The
   migration links the confirmed admin user and upgrades the existing LFT roster.
   If the admin Auth user is created later, run the migration's
   `INSERT INTO public.admin_accounts` statement again.
3. In **Authentication → URL Configuration**, add the deployed
   `/reset-password` URL to **Redirect URLs**.
4. Apply the [LFT account scope migration](supabase/migrations/20261128052143_lft_account_scope.sql).
   It keeps existing officer records and restricts signed-in LFT parcel access
   to each officer’s assigned barangays.
5. Set `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) as a **server-only**
   environment variable for the deployment. Use the same project for the server
   and client Supabase URL and publishable key.
6. In **User Accounts**, enter the officer’s username, email, initial password,
   and barangays. The app creates the Auth user and roster link together. The
   officer can then sign in with the username or email.

Existing Auth users retain their credentials. Existing phone-only identities
need their UUID linked in `lft_technicians.auth_user_id` for role lookup.
Staff tables store profiles and assignments. Supabase Auth manages passwords.

---

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start the local development server
npm run dev

# 3. Open browser at http://localhost:3000
```

For local interface testing, use the development-only account:

- Username: `silago.test`
- Password: `TestSilago2026!`

This account is available only with the Vite development server and is excluded from production builds. It is a UI testing session and is not a Supabase user. Use a non-production Supabase project when testing workflows that write data.

---

## 🛠️ Project Structure & Configuration

- `vercel.json` – Configured for single-page application (SPA) client-side routing rewrites and serverless API endpoints.
- `/api` – Serverless functions for `/api/health` and `/api/gemini/chat` on Vercel.
- `server.ts` – Full-stack Node/Express server for self-hosted or containerized environments.
- `src/` – Complete React 19 + TypeScript + Tailwind CSS application with Leaflet GIS mapping and Supabase real-time integration.


#### MAO office registry

Run the SQL files in `supabase/migrations` in timestamp order before deploying the
matching frontend. Rice_Registry_V2 already has these migrations applied.

Use **Rice Farm Records** to register parcels and review farmer and parcel
verification. Use **Crops & Seed Distribution** to record a planting, request
inputs, receive stock, release inputs, or print the release acknowledgment.
An Extension Worker sees records for assigned barangays. A Central Admin can
verify records, receive municipal stock, review audit activity, and export the
municipal summary.

Connection interruptions queue parcel and distribution changes under the active
staff account. Reconnect in the same account to sync. A release is confirmed
and printable after the server accepts it and updates stock.
