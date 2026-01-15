# Setup Instructions

## Quick Start

1. **Install dependencies:**
```bash
npm install
cd client && npm install && cd ..
```

2. **Seed the database with Wikipedia pages:**
```bash
npm run seed
```

This will fetch 100 popular Wikipedia pages by default. For more pages:
```bash
npm run seed:large  # Fetches 500 pages
# Or specify custom amount:
node server/scripts/seed-wikipedia.js 1000
```

3. **Start the development server:**
```bash
npm run dev
```

This will start both the backend (port 3001) and frontend (port 3000).

4. **Open your browser:**
Navigate to `http://localhost:3000`

## Manual Setup Steps

### Backend Setup

1. Install backend dependencies:
```bash
npm install
```

2. Seed the database:
```bash
npm run seed
```

3. Start the backend server:
```bash
npm run server
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install frontend dependencies:
```bash
npm install
```

3. Start the React development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## Database

The application uses SQLite for the database. The database file (`database.sqlite`) will be created automatically in the `server/` directory when you first run the seed script.

To reset the database, simply delete `server/database.sqlite` and run the seed script again.

## Production Build

To build the frontend for production:

```bash
npm run build
```

The built files will be in `client/build/`, which will be served by the Express server in production.

## Notes

- The seed script includes rate limiting (200ms delay between API calls) to be respectful to Wikipedia's servers
- Fetching large numbers of pages (1000+) can take a while due to API rate limiting
- The Elo rating system starts all items at 1500 rating
- User sessions are tracked in localStorage for the leaderboard

