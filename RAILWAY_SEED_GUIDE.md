# How to Seed Database on Railway 🌱

Multiple ways to seed your database on Railway.

## Method 1: Railway Dashboard Terminal (Easiest)

1. Go to your Railway dashboard: [railway.app](https://railway.app)
2. Click on your project
3. Click on your service (the one that's running)
4. Look for a **"Deployments"** or **"Metrics"** tab
5. Look for a **"View Logs"** or **"Terminal"** button
6. Or look for a **"..."** (three dots menu) button
7. Select **"Open Shell"** or **"Run Command"** or **"Terminal"**
8. In the terminal, type:
   ```bash
   npm run seed
   ```
9. Press Enter and wait for it to complete

## Method 2: Railway CLI (Command Line)

If Method 1 doesn't work, use the Railway CLI:

### Install Railway CLI
```bash
npm install -g @railway/cli
```

### Login to Railway
```bash
railway login
```
This will open your browser to authenticate.

### Link to Your Project
```bash
railway link
```
Select your project when prompted.

### Run Seed Command
```bash
railway run npm run seed
```

This will run the seed command in your Railway environment.

## Method 3: Add Seed to Startup (Automatic)

If you want the database to auto-seed on first deployment, we can modify the startup script.

## Method 4: Check If Database Already Has Data

Actually, the database might already have data! Check by:

1. Visit your Railway URL
2. Try to get a comparison
3. If it works, the database might already be seeded
4. If you get "Not enough items", then you need to seed

## Method 5: Using Railway's Environment Tab

Some Railway versions have an "Environment" tab where you can run commands:

1. Go to your service
2. Click **"Variables"** or **"Settings"** tab
3. Look for **"Run Command"** or **"Execute"** option

## Still Can't Find It?

The Railway UI can vary. Try these:

- Look for a **"Terminal"** icon/button
- Look for **"Shell"** option
- Look for **"Execute"** or **"Run"** button
- Check the **"Deployments"** tab → click on a deployment → look for run options
- Check the service **Settings** → look for command execution

## Alternative: Seed on First Run

If you can't find the command runner, I can modify the code to automatically seed if the database is empty. Would you like me to do that?

---

**Let me know which method works for you, or I can set up automatic seeding!**

