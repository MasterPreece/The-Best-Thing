import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    // Refresh leaderboard every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const [error, setError] = useState(null);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get('/api/leaderboard');
      setLeaderboard(response.data.leaderboard || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      const errorMessage = error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your internet connection.'
        : 'Failed to load leaderboard. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  if (loading && leaderboard.length === 0) {
    return (
      <div className="leaderboard-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error && leaderboard.length === 0) {
    return (
      <div className="leaderboard-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button onClick={fetchLeaderboard} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1>🏅 Leaderboard</h1>
        <p>Top contributors who have made the most comparisons</p>
      </div>

      {error && (
        <div className="leaderboard-error-banner">
          {error} <button onClick={fetchLeaderboard} className="retry-link">Try again</button>
        </div>
      )}

      <div className="leaderboard-list">
        {leaderboard.length === 0 ? (
          <div className="no-leaderboard">
            No leaderboard data yet. Start comparing items to see your rank!
          </div>
        ) : (
          leaderboard.map((user) => (
            <div
              key={user.sessionId}
              className={`leaderboard-item ${user.rank <= 3 ? 'top-three' : ''}`}
            >
              <div className="leaderboard-rank">
                {getMedal(user.rank) || `#${user.rank}`}
              </div>
              <div className="leaderboard-user">
                <div className="user-id">
                  {user.sessionId.length > 20
                    ? user.sessionId.substring(0, 20) + '...'
                    : user.sessionId}
                </div>
                <div className="user-stats">
                  <span className="stat-badge">
                    {user.comparisonsCount} comparisons
                  </span>
                  {user.lastActive && (
                    <span className="last-active">
                      Last active: {new Date(user.lastActive).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

