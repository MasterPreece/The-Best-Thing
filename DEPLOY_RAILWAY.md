# Deploying to Railway 🚂

Complete guide to deploy "The Best Thing" to Railway.

## Prerequisites

1. **GitHub Account** - Your code needs to be on GitHub
2. **Railway Account** - Sign up at [railway.app](https://railway.app) (free)

## Step 1: Prepare Your Code

### 1.1 Make sure everything is committed to Git

```bash
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### 1.2 Verify your code is on GitHub

- Go to your GitHub repository
- Make sure all files are pushed

## Step 2: Deploy to Railway

### 2.1 Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign up with GitHub (recommended)

### 2.2 Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository
4. Railway will auto-detect it's a Node.js app

### 2.3 Configure Build Settings

Railway should auto-detect, but verify:

- **Build Command**: `npm install && cd client && npm install && npm run build`
- **Start Command**: `npm start`
- **Root Directory**: `/` (root)

### 2.4 Set Environment Variables (Optional)

Railway will use defaults, but you can set:

- `PORT` - Railway sets this automatically (don't override)
- `JWT_SECRET` - Set a random secret for production:
  ```bash
  # Generate a secret:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Then set `JWT_SECRET` in Railway dashboard

### 2.5 Deploy

1. Railway will automatically start building
2. Watch the build logs
3. Once deployed, Railway will give you a URL like: `https://your-app.up.railway.app`

## Step 3: Configure Domain (Optional)

### 3.1 Custom Domain

1. In Railway dashboard, go to **Settings** → **Networking**
2. Click **"Generate Domain"** for a Railway domain
3. Or add your own custom domain

### 3.2 Update CORS (if needed)

If you add a custom domain, you might need to update CORS in `server/index.js`:

```javascript
app.use(cors({
  origin: ['https://yourdomain.com', 'https://your-app.up.railway.app']
}));
```

## Step 4: Seed the Database

After deployment, seed your database:

### Option 1: Via Railway CLI

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```

4. Run seed command:
   ```bash
   railway run npm run seed
   ```

### Option 2: Via Railway Dashboard

1. Go to your project in Railway
2. Click on your service
3. Go to **"Deployments"** tab
4. Click **"..."** → **"Run Command"**
5. Enter: `npm run seed`
6. Click **"Run"**

## Step 5: Verify Deployment

1. Visit your Railway URL
2. Test the app:
   - Compare items
   - Check rankings
   - Test account creation
   - Verify everything works

## Step 6: Monitor and Maintain

### 6.1 View Logs

- Railway dashboard → Your service → **"Logs"** tab
- Monitor for errors

### 6.2 Database Backups

- Railway provides automatic backups
- Check **Settings** → **Database** for backup options

### 6.3 Updates

- Push to GitHub → Railway auto-deploys
- Or manually trigger deployment in dashboard

## Troubleshooting

### Build Fails

**Issue**: Build command fails
**Solution**: 
- Check build logs in Railway
- Ensure all dependencies are in `package.json`
- Verify Node.js version (Railway auto-detects)

### Database Issues

**Issue**: Database not working
**Solution**:
- SQLite should work on Railway
- Check file permissions
- Verify database path is correct

### Port Issues

**Issue**: App won't start
**Solution**:
- Railway sets `PORT` automatically
- Don't hardcode port 3001
- Use `process.env.PORT || 3001` (already done)

### CORS Errors

**Issue**: Frontend can't connect to API
**Solution**:
- Update CORS in `server/index.js` to include Railway domain
- Or use same domain for frontend and backend

## Production Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created
- [ ] Build successful
- [ ] Database seeded
- [ ] App accessible via Railway URL
- [ ] All features tested
- [ ] Environment variables set (JWT_SECRET)
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up

## Railway Pricing

- **Free Tier**: $5 credit/month
- **Hobby Plan**: $5/month (if you exceed free tier)
- **Pro Plan**: $20/month (for production apps)

For a small app like this, the free tier should be sufficient!

## Next Steps After Deployment

1. **Share your app**: Post the Railway URL
2. **Monitor usage**: Check Railway dashboard for metrics
3. **Gather feedback**: Get users to test it
4. **Iterate**: Make improvements based on feedback

## Support

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)

---

**You're all set!** 🚀 Your app should be live on Railway!

