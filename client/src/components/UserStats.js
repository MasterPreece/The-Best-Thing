import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './UserStats.css';

const UserStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, navigate]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/auth/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching user stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="user-stats-container">
        <div className="stats-loading">Loading your statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-stats-container">
        <div className="stats-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button onClick={fetchStats} className="retry-button">Try Again</button>
        </div>
      </div>
    );
  }

  const getConsistencyLabel = (score) => {
    if (!score) return 'N/A';
    if (score >= 80) return 'Very Consistent';
    if (score >= 60) return 'Consistent';
    if (score >= 40) return 'Moderate';
    return 'Variable';
  };

  const getConsistencyColor = (score) => {
    if (!score) return '#999';
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#60a5fa';
    if (score >= 40) return '#fbbf24';
    return '#f87171';
  };

  return (
    <div className="user-stats-container">
      <div className="stats-header">
        <h1>Your Statistics 📊</h1>
        <p className="stats-subtitle">Welcome back, {user?.username}!</p>
        <div className="stats-header-actions">
          <Link 
            to={`/rankings/user/${encodeURIComponent(user?.username || '')}`}
            className="view-rankings-button"
          >
            ⭐ View My Rankings
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        {/* Overview Stats */}
        <div className="stat-card stat-card-primary">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-label">Total Votes</div>
            <div className="stat-value">{stats.comparisonsCount || 0}</div>
          </div>
        </div>

        {/* Upset Statistics */}
        <div className="stat-card stat-card-highlight">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-label">Upset Picks</div>
            <div className="stat-value">{stats.upsetPicks || 0}</div>
            {stats.totalUpsetsAvailable > 0 && (
              <div className="stat-detail">
                {stats.upsetPickRate?.toFixed(1) || 0}% of {stats.totalUpsetsAvailable} chances
              </div>
            )}
          </div>
        </div>

        {/* Streak */}
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <div className="stat-label">Longest Streak</div>
            <div className="stat-value">{stats.longestCorrectStreak || 0}</div>
            <div className="stat-detail">correct predictions</div>
          </div>
        </div>

        {/* Consistency */}
        {stats.consistencyScore !== null && (
          <div className="stat-card">
            <div className="stat-icon">📈</div>
            <div className="stat-content">
              <div className="stat-label">Consistency</div>
              <div 
                className="stat-value"
                style={{ color: getConsistencyColor(stats.consistencyScore) }}
              >
                {stats.consistencyScore?.toFixed(0) || 0}%
              </div>
              <div className="stat-detail">{getConsistencyLabel(stats.consistencyScore)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Voting Patterns */}
      <div className="stats-section">
        <h2>Your Voting Patterns</h2>
        
        <div className="pattern-card">
          <div className="pattern-item">
            <div className="pattern-label">Average Rating Difference</div>
            <div className="pattern-value">
              {stats.averageRatingDifference > 0 ? '+' : ''}
              {stats.averageRatingDifference?.toFixed(0) || 0} points
            </div>
            <div className="pattern-description">
              {stats.averageRatingDifference > 0 
                ? 'You tend to pick higher-rated items'
                : stats.averageRatingDifference < 0
                ? 'You tend to pick lower-rated items'
                : 'You pick items regardless of rating'}
            </div>
          </div>

          {stats.favoriteCategoryName && (
            <div className="pattern-item">
              <div className="pattern-label">Favorite Category</div>
              <div className="pattern-value">{stats.favoriteCategoryName}</div>
              <div className="pattern-description">You vote most in this category</div>
            </div>
          )}
        </div>
      </div>

      {/* Achievements Section */}
      {(stats.upsetPicks > 0 || stats.longestCorrectStreak > 0) && (
        <div className="stats-section">
          <h2>Achievements 🏆</h2>
          <div className="achievements-grid">
            {stats.upsetPicks >= 10 && (
              <div className="achievement-card">
                <div className="achievement-icon">🎯</div>
                <div className="achievement-title">Upset Master</div>
                <div className="achievement-description">
                  Picked {stats.upsetPicks} underdog winners!
                </div>
              </div>
            )}
            
            {stats.longestCorrectStreak >= 10 && (
              <div className="achievement-card">
                <div className="achievement-icon">🔥</div>
                <div className="achievement-title">Prediction Pro</div>
                <div className="achievement-description">
                  {stats.longestCorrectStreak}-vote correct streak
                </div>
              </div>
            )}

            {stats.comparisonsCount >= 100 && (
              <div className="achievement-card">
                <div className="achievement-icon">💯</div>
                <div className="achievement-title">Centurion</div>
                <div className="achievement-description">
                  Made {stats.comparisonsCount} comparisons
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member Since */}
      {stats.createdAt && (
        <div className="stats-footer">
          <p>Member since {new Date(stats.createdAt).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long',
            day: 'numeric'
          })}</p>
        </div>
      )}
    </div>
  );
};

export default UserStats;

