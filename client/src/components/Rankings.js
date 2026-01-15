import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Rankings.css';

const Rankings = () => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    fetchRankings();
  }, [limit]);

  const [error, setError] = useState(null);

  const fetchRankings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/items/ranking?limit=${limit}`);
      setRankings(response.data.rankings || []);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      const errorMessage = error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your internet connection.'
        : 'Failed to load rankings. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rankings-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading rankings...</div>
        </div>
      </div>
    );
  }

  if (error && rankings.length === 0) {
    return (
      <div className="rankings-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button onClick={fetchRankings} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rankings-container">
      <div className="rankings-header">
        <h1>🏆 The Best Things Ranking</h1>
        <p>Based on community votes using Elo rating system</p>
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
          </select>
        </div>
      </div>

      {error && (
        <div className="rankings-error-banner">
          {error} <button onClick={fetchRankings} className="retry-link">Try again</button>
        </div>
      )}

      <div className="rankings-list">
        {rankings.length === 0 ? (
          <div className="no-rankings">
            No rankings yet. Start comparing items to build the ranking!
          </div>
        ) : (
          rankings.map((item, index) => (
            <div key={item.id} className="ranking-item">
              <div className="rank-number">
                #{index + 1}
              </div>
              <div className="rank-image">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/80x80?text=No+Image';
                    }}
                  />
                ) : (
                  <div className="image-placeholder">📷</div>
                )}
              </div>
              <div className="rank-info">
                <h3 className="rank-title">{item.title}</h3>
                {item.description && (
                  <p className="rank-description">
                    {item.description.substring(0, 150)}
                    {item.description.length > 150 ? '...' : ''}
                  </p>
                )}
              </div>
              <div className="rank-stats">
                <div className="stat">
                  <strong>Rating:</strong> {Math.round(item.elo_rating)}
                </div>
                <div className="stat">
                  <strong>Votes:</strong> {item.comparison_count || 0}
                </div>
                <div className="stat">
                  <strong>W/L:</strong> {item.wins || 0}/{item.losses || 0}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Rankings;

