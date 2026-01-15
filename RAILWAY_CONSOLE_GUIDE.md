# How to Run Commands on Railway (Terminal/Console) 🔧

Railway doesn't have a web-based terminal, but you can run commands using the Railway CLI. Here's how:

## Option 1: Railway CLI (Recommended) ✅

### Step 1: Install Railway CLI

Open your terminal (on your Mac) and run:

```bash
npm install -g @railway/cli
```

Or if you have Homebrew:
```bash
brew install railway
```

### Step 2: Login to Railway

```bash
railway login
```

This will open your browser to authenticate with Railway.

### Step 3: Link to Your Project

Navigate to your project directory:
```bash
cd "/Users/michaelpreece/The Best Thing"
```

Then link to your Railway project:
```bash
railway link
```

You'll see a list of your Railway projects. Select "The Best Thing" (or whatever you named it).

### Step 4: Run Commands

Now you can run any command in your Railway environment:

**To seed popular articles:**
```bash
railway run npm run seed:popular 50
```

**To seed regular articles:**
```bash
railway run npm run seed
```

**To run any Node.js command:**
```bash
railway run node server/scripts/seed-popular.js 50
```

## Option 2: Check Railway Dashboard

While Railway doesn't have a terminal, you can:

1. **View Logs**: 
   - Go to Railway dashboard
   - Click your service
   - Click "Logs" tab
   - See all console output

2. **Check Deployments**:
   - Go to "Deployments" tab
   - See build/deploy logs

## Quick Test

After linking with Railway CLI, test it:

```bash
railway status
```

This should show your project info.

## Troubleshooting

**"railway: command not found"**
- Make sure you installed it: `npm install -g @railway/cli`
- Or try: `npx @railway/cli` instead

**"Not logged in"**
- Run: `railway login`
- This opens your browser to authenticate

**"No project linked"**
- Run: `railway link`
- Select your project from the list

## Example: Seed Popular Articles

Here's the full workflow:

```bash
# 1. Install CLI (if not already installed)
npm install -g @railway/cli

# 2. Login
railway login

# 3. Go to your project
cd "/Users/michaelpreece/The Best Thing"

# 4. Link to Railway project
railway link

# 5. Run the seed command
railway run npm run seed:popular 50
```

That's it! The command will run on Railway's servers and add popular articles to your production database.

