# PostgreSQL Setup Guide 🐘

Your app now supports both **PostgreSQL** (production) and **SQLite** (development). When you add PostgreSQL to Railway, it will automatically be used instead of SQLite.

## Quick Setup on Railway

1. **Go to your Railway project**
2. Click **"+ New"** or **"New Service"**
3. Select **"Database"** → **"Add PostgreSQL"**
4. Railway will automatically:
   - Create a PostgreSQL database
   - Set the `DATABASE_URL` environment variable
   - Your app will automatically detect it and use PostgreSQL!

5. **That's it!** No code changes needed - it's all automatic.

## How It Works

- **If `DATABASE_URL` is set** (Railway PostgreSQL): Uses PostgreSQL
- **If `DATABASE_URL` is not set** (local development): Uses SQLite

The app automatically converts SQL queries between SQLite and PostgreSQL syntax, so you don't need to change any code.

## Benefits of PostgreSQL

✅ **Persistent storage** - Data survives deployments  
✅ **Better performance** - Optimized for production  
✅ **Automatic backups** - Railway handles backups  
✅ **Scalability** - Can handle more concurrent users  

## Migrating Existing Data

If you already have data in SQLite, you'll need to:

1. Export your SQLite data (or just let the auto-seed repopulate it)
2. The new PostgreSQL database will start fresh
3. Auto-seeding will populate it with Wikipedia articles automatically

## Verification

After adding PostgreSQL, check Railway logs for:
```
Connected to PostgreSQL database
PostgreSQL tables created successfully
```

If you see these messages, PostgreSQL is working correctly!

## Troubleshooting

**Issue**: Still using SQLite  
**Solution**: Make sure `DATABASE_URL` environment variable is set in Railway

**Issue**: Connection errors  
**Solution**: Check that PostgreSQL service is running and connected to your app service

**Issue**: Tables not created  
**Solution**: Check Railway logs - table creation happens automatically on startup

## Development

For local development, SQLite is still used (no `DATABASE_URL` needed). Just run:
```bash
npm run dev
```

The database file will be at `server/database.sqlite`.

