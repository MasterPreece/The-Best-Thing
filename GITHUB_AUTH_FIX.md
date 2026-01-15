# Fix GitHub Authentication

GitHub requires a Personal Access Token instead of a password.

## Quick Fix Steps

### Step 1: Create Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `the-best-thing-deployment`
4. Select expiration: **90 days** (or longer)
5. Check these permissions:
   - ✅ `repo` (full control of private repositories)
6. Click **"Generate token"**
7. **COPY THE TOKEN IMMEDIATELY** (you won't see it again!)
   - It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 2: Use Token Instead of Password

When you run `git push`, use:
- **Username**: `michael.r.preece@gmail.com` (your GitHub email)
- **Password**: Paste the token you just created

### Step 3: Try Pushing Again

```bash
git push -u origin main
```

When prompted:
- Username: `michael.r.preece@gmail.com`
- Password: `ghp_your_token_here` (paste the token)

## Alternative: Update Remote URL

If you want to include the token in the URL (so you don't have to enter it each time):

```bash
# Remove existing remote
git remote remove origin

# Add remote with token (replace YOUR_TOKEN with your actual token)
git remote add origin https://YOUR_TOKEN@github.com/MasterPreece/the-best-thing.git

# Push
git push -u origin main
```

**Note**: This stores the token in your Git config. Less secure but more convenient.

## Even Better: Use SSH (Recommended for Long-term)

### Set up SSH Key

1. Check if you have SSH key:
   ```bash
   ls -al ~/.ssh
   ```

2. If no key, generate one:
   ```bash
   ssh-keygen -t ed25519 -C "michael.r.preece@gmail.com"
   # Press Enter to accept defaults
   ```

3. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the output
   ```

4. Add to GitHub:
   - Go to: https://github.com/settings/keys
   - Click "New SSH key"
   - Paste your public key
   - Save

5. Update remote to use SSH:
   ```bash
   git remote set-url origin git@github.com:MasterPreece/the-best-thing.git
   ```

6. Push:
   ```bash
   git push -u origin main
   ```

## Quick Command Reference

```bash
# Check current remote
git remote -v

# Remove remote
git remote remove origin

# Add remote (HTTPS with token)
git remote add origin https://YOUR_TOKEN@github.com/MasterPreece/the-best-thing.git

# Add remote (SSH - recommended)
git remote add origin git@github.com:MasterPreece/the-best-thing.git

# Push
git push -u origin main
```

## Verify It Worked

After successful push:
1. Go to: https://github.com/MasterPreece/the-best-thing
2. You should see all your files
3. Check the commit history shows your commit

