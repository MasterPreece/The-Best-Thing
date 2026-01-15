# Setting Up Persistent Storage on Railway 📦

## The Problem

SQLite database files stored in the app directory are **wiped on every deployment** because Railway creates a fresh container each time. This means all your voting data, rankings, and user accounts are lost on each deploy.

## Solution 1: Railway PostgreSQL (RECOMMENDED) 🎯

**This is the easiest and most reliable solution!** Railway provides a managed PostgreSQL service that automatically persists data.

### Step 1: Add PostgreSQL to Your Project

1. Go to your Railway project dashboard
2. Click **"+ New"** or **"New Service"**
3. Select **"Database"** → **"Add PostgreSQL"**
4. Railway will create a PostgreSQL service with automatic persistence

### Step 2: Connect Your App to PostgreSQL

1. Railway will automatically set environment variables like:
   - `DATABASE_URL`
   - `PGHOST`
   - `PGPORT`
   - `PGUSER`
   - `PGPASSWORD`
   - `PGDATABASE`

2. Your app will automatically use PostgreSQL if `DATABASE_URL` is set!

### Step 3: Redeploy Your App

Once PostgreSQL is added, your next deployment will automatically use it instead of SQLite.

## Solution 2: Railway Persistent Volumes (Alternative)

If you prefer to stick with SQLite, you can use Railway's persistent volumes:

### How to Find Volumes in Railway

The volume option might be in different places depending on your Railway UI:

**Option A: Settings Tab**
1. Go to your Railway project dashboard
2. Click on your service (the one running the app)
3. Go to the **"Settings"** tab
4. Scroll down to find **"Volumes"** section
5. Click **"New Volume"** or **"Add Volume"**

**Option B: Right-Click Menu**
1. On the Railway project canvas, **right-click** on your service card
2. Look for **"Attach Volume"** or **"Add Volume"** option

**Option C: Command Palette**
1. Press `⌘ + K` (Mac) or `Ctrl + K` (Windows) to open Command Palette
2. Type "volume" or "attach volume"
3. Select the option to create/attach a volume

**Option D: Service Menu**
1. Click on your service
2. Look for a **"..."** (three dots menu) button
3. Check for volume options there

If you **still can't find it**, volumes might require a paid plan (Pro tier). In that case, **use Solution 1 (PostgreSQL) instead** - it's free and easier!

### Step 2: Configure the Volume (if you found it)

Once you find the volume option:
1. **Mount Path**: Enter `/data` (this is important - must match the code)
2. **Size**: 1GB is usually enough (you can increase later)
3. Click **"Create"** or **"Attach"**

### Step 3: Deploy

Once the volume is attached, the database will automatically be stored in `/data/database.sqlite` instead of the app directory, and it will persist between deployments!

**Note**: If you set a different mount path (not `/data`), you'll need to set an environment variable:
- **Variable**: `RAILWAY_VOLUME_MOUNT_PATH`
- **Value**: Your mount path (e.g., `/app/data`)

## Solution 3: Try These Alternative Locations

If you can't find volumes anywhere, try:

1. **Check your Railway plan**: Volumes might require Pro tier
2. **Check the service type**: Some service types don't support volumes
3. **Contact Railway Support**: They can enable volumes for your account

**Or just use PostgreSQL (Solution 1) - it's the easiest and most reliable!**

## Verify It's Working

After deploying, check Railway logs for:
```
Database will be stored at: /data/database.sqlite
```

If you see this, the persistent storage is working!

## Important Notes

- **The volume must be attached BEFORE the first deployment** (or you'll lose the initial data)
- **Volume size**: SQLite files are small, so 1GB is plenty even for thousands of items
- **Backups**: Consider backing up the database file periodically (Railway doesn't auto-backup volumes)

## Alternative: External Database

If persistent volumes don't work for you, consider migrating to:
- **Railway PostgreSQL**: More robust, automatic backups, better for production
- **Railway MySQL**: Alternative database option

Let me know if you need help setting up Railway PostgreSQL instead!

