# Setting Up GitHub Repository

Guide to initialize Git and push your code to GitHub.

## Step 1: Initialize Git Repository

Open your terminal in the project directory and run:

```bash
cd "/Users/michaelpreece/The Best Thing"
git init
```

## Step 2: Add All Files

```bash
git add .
```

## Step 3: Make Your First Commit

```bash
git commit -m "Initial commit - The Best Thing app"
```

## Step 4: Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click the **"+"** icon in the top right
3. Select **"New repository"**
4. Name it: `the-best-thing` (or whatever you prefer)
5. **Don't** initialize with README, .gitignore, or license (we already have these)
6. Click **"Create repository"**

## Step 5: Connect Local Repository to GitHub

GitHub will show you commands. Use these:

```bash
# Add GitHub as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/the-best-thing.git

# Rename default branch to main (if needed)
git branch -M main

# Push your code
git push -u origin main
```

You'll be prompted for your GitHub username and password (or use a Personal Access Token).

## Step 6: Verify Upload

### Method 1: Check GitHub Website
1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/the-best-thing`
2. You should see all your files:
   - `package.json`
   - `server/` folder
   - `client/` folder
   - `README.md`
   - etc.

### Method 2: Check in Terminal
```bash
# Check remote connection
git remote -v

# Should show:
# origin  https://github.com/YOUR_USERNAME/the-best-thing.git (fetch)
# origin  https://github.com/YOUR_USERNAME/the-best-thing.git (push)

# Check status
git status

# Should say: "Your branch is up to date with 'origin/main'"
```

### Method 3: Check File Count
On GitHub, you should see:
- Multiple files in root (package.json, README.md, etc.)
- `server/` directory with subdirectories
- `client/` directory with src/ folder
- All the files we created

## Troubleshooting

### "Repository not found" Error
- Check that the repository name matches
- Verify your GitHub username is correct
- Make sure the repository exists on GitHub

### Authentication Error
If you get authentication errors:
1. Use a **Personal Access Token** instead of password:
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with `repo` permissions
   - Use token as password when pushing

### "Nothing to commit"
If you see this, your files are already committed. Just push:
```bash
git push -u origin main
```

### Check What's Not Committed
```bash
git status
```
This shows any uncommitted changes.

## Quick Checklist

- [ ] Git repository initialized (`git init`)
- [ ] Files added (`git add .`)
- [ ] First commit made (`git commit`)
- [ ] GitHub repository created
- [ ] Remote added (`git remote add origin`)
- [ ] Code pushed (`git push -u origin main`)
- [ ] Verified on GitHub website

## After Successful Upload

Once your code is on GitHub:
1. ✅ You can deploy to Railway
2. ✅ You can share your code
3. ✅ You can collaborate with others
4. ✅ You have version control

## Next Steps

After verifying your code is on GitHub:
1. Go to Railway
2. Deploy from GitHub repo
3. Select your repository
4. Deploy! 🚀

