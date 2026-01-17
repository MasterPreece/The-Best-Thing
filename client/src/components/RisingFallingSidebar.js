import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './RisingFallingSidebar.css';

const RisingFallingSidebar = () => {
  const [rising, setRising] = useState([]);
  const [falling, setFalling] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRisingFalling = async () => {
      try {
        const response = await axios.get('/api/items/rising-falling?limit=3');
        setRising(response.data.rising || []);
        setFalling(response.data.falling || []);
      } catch (error) {
        console.error('Error fetching rising/falling items:', error);
        // Silently fail - sidebar is optional
        setRising([]);
        setFalling([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRisingFalling();
    // Refresh every 30 seconds
    const interval = setInterval(fetchRisingFalling, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && rising.length === 0 && falling.length === 0) {
    return (
      <div className="rising-falling-sidebar">
        <div className="sidebar-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="rising-falling-sidebar">
      {(rising.length > 0 || falling.length > 0) && (
        <>
          {rising.length > 0 && (
            <div className="trend-section">
              <h3 className="trend-title rising-title">
                <span className="trend-icon">📈</span> Rising
              </h3>
              <div className="trend-list">
                {rising.map((item, index) => (
                  <Link
                    key={item.id}
                    to={`/items/${item.id}`}
                    className="trend-item rising-item"
                  >
                    <div className="trend-rank">{index + 1}</div>
                    <div className="trend-arrow green-arrow">▲</div>
                    <div className="trend-content">
                      <div className="trend-item-title">{item.title}</div>
                      <div className="trend-item-rating">
                        Rating: {Math.round(item.elo_rating)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {falling.length > 0 && (
            <div className="trend-section">
              <h3 className="trend-title falling-title">
                <span className="trend-icon">📉</span> Falling
              </h3>
              <div className="trend-list">
                {falling.map((item, index) => (
                  <Link
                    key={item.id}
                    to={`/items/${item.id}`}
                    className="trend-item falling-item"
                  >
                    <div className="trend-rank">{index + 1}</div>
                    <div className="trend-arrow red-arrow">▼</div>
                    <div className="trend-content">
                      <div className="trend-item-title">{item.title}</div>
                      <div className="trend-item-rating">
                        Rating: {Math.round(item.elo_rating)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RisingFallingSidebar;

