import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './TrendingItems.css';

const TrendingItems = () => {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await axios.get('/api/items/trending?limit=5');
        setTrending(response.data.trending || []);
      } catch (error) {
        console.error('Error fetching trending items:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  if (loading || trending.length === 0) {
    return null; // Don't show anything if loading or no trending items
  }

  return (
    <div className="trending-section">
      <h2 className="trending-title">
        🔥 Hot Right Now
        <span className="trending-subtitle">Items getting lots of votes today</span>
      </h2>
      <div className="trending-grid">
        {trending.slice(0, 5).map((item) => (
          <Link
            key={item.id}
            to={`/items/${item.id}`}
            className="trending-item"
          >
            <div className="trending-item-image">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.title}
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/100x100?text=No+Image';
                  }}
                />
              ) : (
                <div className="trending-item-placeholder">📷</div>
              )}
            </div>
            <div className="trending-item-info">
              <h3 className="trending-item-title">{item.title}</h3>
              <div className="trending-item-stats">
                <span className="trending-badge">
                  🔥 {item.recent_comparisons || 0} votes today
                </span>
                <span className="trending-rating">
                  Rating: {Math.round(item.elo_rating)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default TrendingItems;

