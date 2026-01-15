# Setting Up Persistent Storage on Railway 📦

## The Problem

SQLite database files stored in the app directory are **wiped on every deployment** because Railway creates a fresh container each time. This means all your voting data, rankings, and user accounts are lost on each deploy.

## The Solution: Railway Persistent Volumes

Railway provides persistent volumes that survive deployments. Here's how to set it up:

### Step 1: Create a Volume in Railway

1. Go to your Railway project dashboard
2. Click on your service (the one running the app)
3. Go to the **"Volumes"** tab (or look for "Storage" in the service settings)
4. Click **"New Volume"** or **"Add Volume"**
5. Configure the volume:
   - **Name**: `database-storage` (or any name you like)
   - **Mount Path**: `/data` (this is important - must match the code)
   - **Size**: 1GB is usually enough (you can increase later)

### Step 2: Set Environment Variable (Optional)

If Railway uses a different mount path, you can set:
- **Variable**: `RAILWAY_VOLUME_MOUNT_PATH`
- **Value**: `/data` (or whatever mount path you chose)

### Step 3: Deploy

Once the volume is attached, the database will automatically be stored in `/data/database.sqlite` instead of the app directory, and it will persist between deployments!

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

