# Deployment Guide – Render (Free Tier) + MongoDB Atlas M0 (512 MB)

## Overview

| Component | Service | Storage | Cost |
|-----------|---------|---------|------|
| Backend (Node.js) | Render Web Service | Ephemeral | Free |
| Frontend (React) | Served by backend | — | Free |
| Database | MongoDB Atlas M0 | 512 MB | Free |
| Camera | ESP32-CAM | — | One-time hardware |

## Step 1: MongoDB Atlas Setup

1. Create free account at https://www.mongodb.com/atlas
2. Deploy a **M0 cluster** (512 MB, shared)
3. Under **Security > Database Access**, create a user with password
4. Under **Security > Network Access**, add `0.0.0.0/0` (allow all) or Render's IP range
5. Click **Connect > Connect your application** and copy the connection string

## Step 2: Render Deployment (Backend + Frontend)

Deploy the **whole repo** as a single Web Service (the backend serves the React build).

1. Create account at https://render.com
2. Click **New + > Web Service**
3. Connect your GitHub repo (the full `security-camera` repo)
4. Settings:
   - **Name**: `security-cam-api`
   - **Root Directory**: *(leave blank — use repo root)*
   - **Environment**: `Node`
   - **Build Command**: `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start Command**: `cd backend && node src/server.js`
   - **Plan**: Free
5. Add environment variables:

```
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/security-cam?retryWrites=true&w=majority
CAMERA_API_KEY=<generate-a-random-64-char-string>
JWT_SECRET=<generate-another-random-64-char-string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CommandeR48
MAX_STORAGE_BYTES=524288000
ALERT_THRESHOLD_BYTES=419430400
```

6. Deploy. Note the URL (e.g., `https://security-cam-api.onrender.com`)

### Troubleshooting — "Cannot find module" errors

If you see module errors, the build command may have failed. Try:
- Set **Root Directory** to `backend` and **Start Command** to `node src/server.js`, then set env var `STATIC_DIR=../frontend/build` so the server can find the React build.

## Step 3: Pre-building locally (alternative)

If the build times out on Render (512 MB RAM can struggle with react-scripts), build the frontend locally and commit it:

```bash
cd frontend
npm install
npm run build
# Commit the frontend/build/ folder to git
cd ..
git add frontend/build/
git commit -m "Add frontend build"
git push
```

Then on Render, simplify the build command to just:
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && node src/server.js`

No need to set `STATIC_DIR` — the default path `../../frontend/build` resolves correctly when the whole repo is deployed.

## Step 4: ESP32 Configuration

1. Install ESP32 board support in Arduino IDE (or use PlatformIO)
2. Open `esp32/security_camera.ino`
3. Update `DEF_SERVER` and `DEF_APIKEY` at the top with your Render URL and API key
4. Set Partition Scheme: **Huge APP (3MB No OTA/1MB SPIFFS)**
5. Flash the ESP32-CAM

### First-time setup:
1. Power on the ESP32
2. Connect to Wi-Fi SSID `ESP32-CAM`
3. Open browser to `192.168.4.1`
4. Enter your Wi-Fi credentials and the server URL
5. The device reboots and starts sending frames

## Step 5: Verify

1. Open the dashboard URL (your Render URL)
2. Login with `admin` / `CommandeR48`
3. The **Live View** tab should show frames from the camera
4. **Storage** tab shows real-time usage

---

## Rolling Deletion Logic Explained

The storage monitor runs every hour:

```
checkAndCleanup():
  1. Delete events + alert images older than retentionDays (default 7 days)
     but SKIP locked documents
  2. If total storage > 80% (419 MB):
     Perform rolling deletion of oldest unlocked events
     Stop when usage drops to 400 MB
  3. If total storage > 95% (475 MB):
     Emergency purge ALL unlocked events
```

**TTL Indexes** on `events.createdAt` and `alert_images.createdAt` serve as a final safety net
(automatically delete documents after 7 days at the database level).

## Testing the 500 MB Limit

Use the included test script:

```bash
cd backend
node src/test/storage-test.js
```

This script:
- Generates 600 fake events with ~500 KB thumbnails each (~300 MB)
- Generates alert images (~200 MB)
- Monitors storage and verifies auto-cleanup kicks in
- Reports final storage after rolling deletion

## Cost Summary

| Item | Cost |
|------|------|
| MongoDB Atlas M0 | Free (512 MB) |
| Render Web Service | Free (750 hours/month) |
| ESP32-CAM hardware | ~$10 one-time |
| **Total monthly** | **$0** |

## Simplification Options

- **No face recognition**: Skip the `faces` collection and `/api/faces` endpoints
- **No WebSocket**: Poll `/api/events` every 3 seconds instead of using Socket.IO
- **Store images in GridFS** instead of base64 if thumbnails exceed 50 KB
