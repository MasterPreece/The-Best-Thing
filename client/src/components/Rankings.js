import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { RankingSkeleton } from './SkeletonLoader';
import './Rankings.css';

const Rankings = () => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchResults(null);
    try {
      const response = await axios.get(`/api/items/ranking?limit=${limit}`);
      setRankings(response.data.rankings || []);
      setTotalItems(response.data.total || response.data.rankings?.length || 0);
    } catch (error) {
      console.error('Error fetching rankings:', error);
      const errorMessage = error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your internet connection.'
        : 'Failed to load rankings. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const performSearch = useCallback(async (query) => {
    if (!query || query.trim().length === 0) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const response = await axios.get(`/api/items/search?query=${encodeURIComponent(query)}`);
      setSearchResults(response.data.results || []);
      setRankings([]); // Clear regular rankings when searching
    } catch (error) {
      console.error('Error searching items:', error);
      const errorMessage = error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your internet connection.'
        : 'Failed to search items. Please try again.';
      setError(errorMessage);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
    fetchRankings();
  };

  // Debounce search effect
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setSearchResults(null);
      setIsSearching(false);
      fetchRankings();
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch, fetchRankings]);

  const displayItems = searchResults !== null ? searchResults : rankings;

  if (loading && !searchQuery) {
    return <RankingSkeleton count={10} />;
  }

  if (error && rankings.length === 0 && !searchResults) {
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
        
        <div className="search-container">
          <input
            type="text"
            placeholder="Search for any item to see its ranking..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="clear-search-button" title="Clear search">
              ✕
            </button>
          )}
        </div>

        {!searchQuery && (
          <div className="limit-controls">
            <label>Show top:</label>
            <select
              value={limit >= 10000 ? 'all' : limit}
              onChange={(e) => {
                const newLimit = e.target.value === 'all' ? 10000 : Number(e.target.value);
                setLimit(newLimit);
              }}
              className="limit-select"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
              <option value="all">All ({totalItems || '...'})</option>
            </select>
            {totalItems > 0 && limit < 10000 && (
              <span className="total-items-info">
                Showing {rankings.length} of {totalItems} items
              </span>
            )}
          </div>
        )}

        {searchQuery && searchResults !== null && (
          <div className="search-results-info">
            {isSearching ? (
              <span>Searching...</span>
            ) : (
              <span>
                Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rankings-error-banner">
          {error} <button onClick={() => searchQuery ? performSearch(searchQuery) : fetchRankings()} className="retry-link">Try again</button>
        </div>
      )}

      <div className="rankings-list">
        {isSearching ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <div className="loading-text">Searching...</div>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="no-rankings">
            {searchQuery 
              ? `No items found matching "${searchQuery}". Try a different search term!`
              : 'No rankings yet. Start comparing items to build the ranking!'
            }
          </div>
        ) : (
          displayItems.map((item, index) => (
            <Link key={item.id} to={`/items/${item.id}`} className="ranking-item-link">
              <div className="ranking-item">
                <div className="rank-number">
                  {searchResults !== null && item.rank 
                    ? `#${item.rank}`
                    : `#${index + 1}`
                  }
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
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Rankings;

