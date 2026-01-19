import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { RankingSkeleton } from './SkeletonLoader';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/leaderboard?limit=${limit}`);
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
  }, [limit]);

  useEffect(() => {
    fetchLeaderboard();
    // Refresh leaderboard every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  if (loading && leaderboard.length === 0) {
    return <RankingSkeleton count={10} />;
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
        <div className="limit-controls">
          <label>Show top:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="limit-select"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1,000</option>
            <option value={10000}>All</option>
          </select>
        </div>
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
          leaderboard.map((user) => {
            const hasBadges = user.isTopUpset || user.isTopStreak || user.isTopAvgDiff || user.isTopUpsetRate;
            
            return (
              <div
                key={user.identifier || user.sessionId || user.username}
                className={`leaderboard-item ${user.rank <= 3 ? 'top-three' : ''} ${hasBadges ? 'top-performer' : ''}`}
              >
                <div className="leaderboard-rank">
                  {getMedal(user.rank) || `#${user.rank}`}
                </div>
                <div className="leaderboard-user">
                  <div className="user-id">
                    {user.username ? (
                      <span>
                        👤 {user.username}
                        <span className="user-type-badge">Registered</span>
                      </span>
                    ) : (
                      <span>
                        🎲 {(user.sessionId || user.identifier || 'Anonymous').substring(0, 20)}
                        {user.sessionId && user.sessionId.length > 20 ? '...' : ''}
                        <span className="user-type-badge">Anonymous</span>
                      </span>
                    )}
                  </div>
                  {hasBadges && (
                    <div className="achievement-badges">
                      {user.isTopUpset && (
                        <span 
                          className="stat-badge badge-upset" 
                          title={`Biggest upset: ${user.biggestUpset ? Math.round(user.biggestUpset) : 0} points`}
                        >
                          🔥 Biggest Upset
                        </span>
                      )}
                      {user.isTopStreak && (
                        <span 
                          className="stat-badge badge-streak" 
                          title={`Longest streak: ${user.longestStreak} correct predictions`}
                        >
                          ⚡ Longest Streak
                        </span>
                      )}
                      {user.isTopAvgDiff && (
                        <span 
                          className="stat-badge badge-avg-diff" 
                          title={`Highest average point differential: ${Math.round(user.avgPointDifferential)} points`}
                        >
                          📊 Highest Avg Differential
                        </span>
                      )}
                      {user.isTopUpsetRate && (
                        <span 
                          className="stat-badge badge-upset-master" 
                          title={`Upset pick rate: ${user.upsetPickRate}% (${user.upsetPicksCount} upsets picked)`}
                        >
                          🎯 Upset Master
                        </span>
                      )}
                    </div>
                  )}
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
            );
          })
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

