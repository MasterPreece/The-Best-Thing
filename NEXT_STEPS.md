# Next Steps - Getting "The Best Thing" Running 🚀

## Current Status ✅
- ✅ Dependencies installed (node_modules present)
- ✅ Database created (database.sqlite exists)
- ✅ Database seeded (100 items ready)
- ✅ All code files in place

## Step 1: Start the Development Server

Open your terminal and run:

```bash
cd "/Users/michaelpreece/The Best Thing"
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- React frontend on `http://localhost:3000`

The frontend will automatically open in your browser. If not, navigate to `http://localhost:3000`

## Step 2: Test the Application

### Test the Comparison Page
1. Go to `http://localhost:3000`
2. You should see two Wikipedia items side-by-side
3. Click on one to vote for it
4. A new comparison should load automatically

### Test the Rankings Page
1. Click "Rankings" in the navigation
2. You should see a ranked list of all items
3. Items should be sorted by Elo rating

### Test the Leaderboard Page
1. Click "Leaderboard" in the navigation
2. You should see users ranked by number of comparisons made
3. Make some votes to see yourself appear on the leaderboard

## Step 3: Verify Everything Works

### Check the Console
- Look for any errors in the browser console (F12 → Console)
- Check the server terminal for any errors

### Test API Endpoints (Optional)
You can test the API directly:

```bash
# Get a random comparison
curl http://localhost:3001/api/comparison

# Submit a vote (replace item IDs with real ones from the comparison)
curl -X POST http://localhost:3001/api/comparison/vote \
  -H "Content-Type: application/json" \
  -d '{"item1Id": 1, "item2Id": 2, "winnerId": 1, "userSessionId": "test123"}'

# Get rankings
curl http://localhost:3001/api/items/ranking

# Get leaderboard
curl http://localhost:3001/api/leaderboard
```

## Step 4: Monitor Auto-Growth

The database will automatically grow over time:
- When you request comparisons, it checks if more items are needed
- A scheduler runs every 10 minutes to fetch more items
- Check server logs to see when new items are added
- You'll see messages like "Added: [Article Title]"

## Step 5: Customize (Optional)

### Add More Initial Items
```bash
npm run seed:large  # Fetches 500 items
# Or custom amount:
node server/scripts/seed-wikipedia.js 1000
```

### Adjust Auto-Growth Settings
Edit `server/services/wikipedia-fetcher.js`:
- `MIN_ITEMS_THRESHOLD` - Minimum items before fetching (default: 50)
- `BATCH_SIZE` - Items per batch (default: 10)
- `API_DELAY` - Delay between requests in ms (default: 300)

### Adjust Scheduler Frequency
Edit `server/utils/scheduler.js`:
- `INTERVAL` - How often to check (default: 10 minutes)

## Troubleshooting

### Port Already in Use
If port 3000 or 3001 is already in use:
- Kill the process: `lsof -ti:3000 | xargs kill` (for 3000)
- Or change ports in `server/index.js` and `client/package.json`

### Database Errors
- Delete `server/database.sqlite` and run `npm run seed` again

### Wikipedia API 403 Errors
- The User-Agent is already set up correctly
- Make sure you're not making too many requests too quickly
- Check if Wikipedia is blocking your IP (unlikely)

### React Build Errors
- Make sure all client dependencies are installed: `cd client && npm install`

## Next Development Steps

1. **Deploy to Production**
   - Build the React app: `npm run build`
   - Set up a production server (Heroku, DigitalOcean, AWS, etc.)
   - Configure environment variables

2. **Enhancements**
   - Add user accounts/authentication
   - Add categories/tags for items
   - Add social sharing features
   - Add more statistics and analytics

3. **Scale**
   - The database will grow to thousands of items automatically
   - Consider PostgreSQL for production instead of SQLite
   - Add caching for frequently accessed data

## You're Ready! 🎉

Just run `npm run dev` and start comparing things!

