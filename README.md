# The Best Thing 🏆

A fun meme website where users compare two things and vote for the better one. Based on hundreds of thousands of comparisons, items are ranked using an Elo rating system to determine "the best thing."

## Features

- 🎯 **Compare Items**: See two Wikipedia pages side-by-side and choose which is better
- 📊 **Rankings**: Items are ranked using an Elo rating system based on user votes
- 🏅 **Leaderboards**: See who has made the most comparisons
- 🖼️ **Smart Image Fallback**: Uses Wikipedia images first, falls back to Unsplash, then placeholder images
- 🔧 **Admin Dashboard**: Manage items, view statistics, and refine the database (password-protected)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- (Optional) Unsplash API key for better image fallback coverage

### Optional: Unsplash API Key Setup

The app will work without an Unsplash API key, but adding one improves image coverage when Wikipedia articles don't have images:

1. Sign up for a free Unsplash account: https://unsplash.com/developers
2. Create a new application
3. Copy your Access Key
4. Set it as an environment variable:
   ```bash
   # In your .env file (local development)
   UNSPLASH_ACCESS_KEY=your_access_key_here
   
   # Or in Railway (production)
   # Add UNSPLASH_ACCESS_KEY to your environment variables
   ```

**Note**: Without an API key, the app will still work but will use placeholder images for items without Wikipedia images.

### Admin Dashboard Setup

The admin dashboard allows you to manage items in the database. Set an admin password:

```bash
# In your .env file (local development)
ADMIN_PASSWORD=your-secure-password-here

# Or in Railway (production)
# Add ADMIN_PASSWORD to your environment variables
```

**Important**: Change the default password in production! The default is `admin-change-me-in-production`.

To access the admin dashboard:
1. Visit `/admin` in your browser
2. Enter your admin password
3. You'll see a dashboard with:
   - Database statistics (total items, comparisons, users, etc.)
   - Full item list with search and pagination
   - Add, edit, and delete items
   - Image previews and item details

### Installation

1. Install dependencies:
```bash
npm install
```

2. Seed the database with Wikipedia pages:
```bash
npm run seed
```

3. Install client dependencies:
```bash
cd client && npm install && cd ..
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Project Structure

```
the-best-thing/
├── server/           # Backend API
│   ├── controllers/  # Route controllers
│   ├── routes/       # API routes
│   ├── utils/        # Utility functions (Elo algorithm)
│   ├── scripts/      # Database seeding scripts
│   └── database.js   # Database setup
├── client/           # React frontend
└── package.json
```

## API Endpoints

### Public Endpoints
- `GET /api/comparison` - Get two random items to compare
- `POST /api/comparison/vote` - Submit a vote for which item is better
- `GET /api/items/ranking` - Get the ranking list of all items
- `GET /api/items/:id` - Get details for a specific item
- `GET /api/leaderboard` - Get the leaderboard of top users
- `GET /api/stats` - Get global statistics

### Admin Endpoints (require admin password)
- `POST /api/admin/login` - Login with admin password
- `GET /api/admin/items` - Get all items (paginated, searchable)
- `POST /api/admin/items` - Create a new item
- `PUT /api/admin/items/:id` - Update an item
- `DELETE /api/admin/items/:id` - Delete an item
- `GET /api/admin/stats` - Get detailed database statistics

## How It Works

1. Users are presented with two random items from the database
2. Users click on which item they think is "better"
3. The system uses an Elo rating algorithm to update both items' ratings
4. Items are ranked by their Elo rating
5. Users can view rankings and leaderboards
6. **The database grows over time**: When the database has fewer than 50 items, it automatically fetches random Wikipedia articles in the background to keep content fresh

## Elo Rating System

The ranking uses a modified Elo rating system (similar to chess rankings):
- Starting rating: 1500
- K-factor: 32 (determines rating change per comparison)
- Higher rating = better thing (according to the community)

## Auto-Growth System

The database automatically grows over time as people use the tool:

- **On-demand fetching**: When users request comparisons, the system checks if the database needs more items
- **Background scheduler**: A scheduler runs every 10 minutes to check and fetch more items if needed
- **Respectful rate limiting**: Fetches are limited to 10 items per batch with 300ms delays between requests
- **Random Wikipedia articles**: Uses Wikipedia's random article API to get diverse, interesting content
- **Automatic filtering**: Skips disambiguation pages and lists to keep only quality articles

This means you only need to seed a small initial set (e.g., 50-100 items), and the database will grow organically to thousands of items over time!

## Future Enhancements

- User accounts and profiles
- Social sharing
- Categories/tags for items
- Advanced statistics
- Fetch based on trending/popular Wikipedia pages

