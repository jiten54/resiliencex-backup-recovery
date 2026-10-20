# ResilienceX Deployment & Render/Vercel Connection Guide

This guide provides step-by-step instructions for resolving the Python 3.14/Pydantic build failure on **Render** and connecting the deployed backend to your **Vercel** frontend (`https://resiliencex-backup-recovery.vercel.app/`).

---

## 1. Root Cause Analysis: Python 3.14 & Pydantic Issue

### The Problem
When deploying Python services to Render without specifying an explicit Python version, Render defaults to its latest available image (which recently introduced unreleased/preview Python 3.14). 
- **Pydantic v2 core** (`pydantic-core`) and **psycopg2-binary** compile C extensions. Under Python 3.14, breaking internal C-API changes cause compilation failures, and no pre-built PyPI wheels exist.
- Additionally, legacy `passlib` has an `__about__` attribute error when coupled with unpinned `bcrypt>=4.2.0`.

### The Solution Applied in This Repository
1. **Pinned Python 3.11.9**:
   - Added `.python-version` with `3.11.9`.
   - Added `runtime.txt` with `python-3.11.9`.
   - Specified `PYTHON_VERSION=3.11.9` in `render.yaml`.
2. **Updated Pydantic & Core Dependencies**:
   - Upgraded to `pydantic>=2.7.0,<2.11.0` and `pydantic-settings>=2.2.1,<2.9.0` with full Pydantic v2 `SettingsConfigDict` support.
   - Pinned `bcrypt>=4.0.1,<4.2.0` to eliminate passlib attribute crashes.
   - Added a root `requirements.txt` (`-r backend/requirements.txt`) so builds succeed whether Render executes from repository root `/` or `./backend`.
3. **Database Dialect Normalization**:
   - Render's managed PostgreSQL issues `postgres://` connection strings. SQLAlchemy 2.0 requires `postgresql://`. Added automatic normalization in `config.py` via `settings.get_database_url()`.
   - Added automatic SQLite fallback so the service starts cleanly even if PostgreSQL is temporarily provisioning.
4. **Auto-provisioning & Seeding**:
   - Added a FastAPI lifespan event in `main.py` that automatically calls `Base.metadata.create_all()` and seeds default admin accounts upon startup on fresh Render databases.

---

## 2. Render Deployment Configuration

You can deploy on Render using either the **Render Blueprint (`render.yaml`)** or manual configuration:

### Method A: Blueprint Deployment (Recommended)
1. In your [Render Dashboard](https://dashboard.render.com/), click **New +** > **Blueprint**.
2. Connect your GitHub repository: `https://github.com/jiten54/resiliencex-backup-recovery`.
3. Render will read `render.yaml` and automatically configure:
   - **`resiliencex-api`**: FastAPI Web Service (Python 3.11.9)
   - **`resiliencex-worker`**: Independent Background Worker (Python 3.11.9)
   - **`resiliencex-postgres`**: Managed PostgreSQL database instance
4. Click **Apply**.

---

### Method B: Manual Web Service Setup
If configuring manually in Render:
- **Service Type**: Web Service
- **Name**: `resiliencex-api`
- **Region**: Oregon (or closest to your users)
- **Branch**: `main`
- **Root Directory**: `.` (leave empty or set to root)
- **Runtime**: `Python`
- **Build Command**:
  ```bash
  pip install --upgrade pip && pip install -r requirements.txt
  ```
- **Start Command**:
  ```bash
  uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
  ```
  *(Note: `uvicorn main:app --host 0.0.0.0 --port $PORT` also works via the root `main.py` entry point)*
- **Health Check Path**: `/health/live`
- **Environment Variables**:
  | Variable | Value | Description |
  | :--- | :--- | :--- |
  | `PYTHON_VERSION` | `3.11.9` | Prevents Render from defaulting to Python 3.14 |
  | `DATABASE_URL` | `postgresql://...` | Connection string from Render PostgreSQL |
  | `JWT_SECRET` | *(click Generate)* | 64-char random secret for tokens |
  | `CORS_ORIGINS` | `https://resiliencex-backup-recovery.vercel.app,http://localhost:3000` | Enables Vercel frontend CORS |
  | `STORAGE_BACKEND`| `local` | Uses local disk vault (or `s3` with AWS credentials) |

---

## 3. Connecting Render Backend to Vercel Frontend

Your frontend is deployed at: **`https://resiliencex-backup-recovery.vercel.app/`**

### Option 1: Vercel Environment Variable (Persistent)
1. Go to your [Vercel Dashboard](https://vercel.com/) > Select **`resiliencex-backup-recovery`**.
2. Navigate to **Settings** > **Environment Variables**.
3. Add:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://<your-render-service>.onrender.com` (your Render backend URL)
4. Go to **Deployments** > Click the three dots on your latest deployment > **Redeploy**.

---

### Option 2: Live In-App Configuration (Instant, Zero Build Required)
1. Open your Vercel app: `https://resiliencex-backup-recovery.vercel.app/`
2. Navigate to the **Retention & Storage** tab in the navigation header.
3. Locate the **Vercel <—> Render Cloud Integration** panel.
4. Paste your Render backend URL (e.g., `https://resiliencex-api.onrender.com`).
5. Click **Save Endpoint** and **Test Ping**.
6. The connection indicator will turn green: **`ONLINE (<latency>ms)`**, and all actions will immediately route to your live Render backend!

---

## 4. Verification & Testing

Once Render completes building, verify your endpoints:

```bash
# 1. Test root status
curl -s https://<your-render-service>.onrender.com/

# 2. Test Kubernetes liveness probe
curl -s https://<your-render-service>.onrender.com/health/live

# 3. Test Kubernetes readiness probe
curl -s https://<your-render-service>.onrender.com/health/ready

# 4. Test Prometheus metrics endpoint
curl -s https://<your-render-service>.onrender.com/metrics

# 5. Run the 11-step automated fault-tolerance test against Render
API_BASE="https://<your-render-service>.onrender.com/api/v1" python3 scripts/simulate_worker_failure.py
```
