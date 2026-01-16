# How to Set ADMIN_PASSWORD on Railway

Since you can't find the Variables tab in Railway dashboard, use the Railway CLI:

## Step 1: Link to Your Railway Project

```bash
cd "/Users/michaelpreece/The Best Thing"
npx @railway/cli login
npx @railway/cli link
```

Select your Railway project when prompted.

## Step 2: Set the ADMIN_PASSWORD Variable

```bash
npx @railway/cli variables set ADMIN_PASSWORD=your-password-here
```

Replace `your-password-here` with your actual admin password (e.g., `admin123`).

## Alternative: If Railway CLI doesn't work

If the CLI doesn't work, here's where to find it in Railway dashboard:

1. Go to https://railway.app
2. Click on your project
3. Click on your **service** (the web service, not the database)
4. Click the **"Variables"** tab (it's in the top menu or sidebar)
5. Click **"+ New Variable"** or **"Add Variable"**
6. Name: `ADMIN_PASSWORD`
7. Value: Your password
8. Click **"Add"**

The Variables tab is usually:
- In the service settings (not project settings)
- Sometimes under "Settings" → "Variables"
- Or in a "Configuration" section

## Test It

After setting the variable:
1. Railway will automatically redeploy
2. Wait for deployment to finish
3. Visit `/admin` on your site
4. Try logging in with your password

## Troubleshooting

If it still doesn't work:
- Make sure you're setting it on the **web service**, not the database service
- Check Railway logs to see if the variable is being read
- The variable name must be exactly `ADMIN_PASSWORD` (all caps)

