import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { RankingSkeleton } from './SkeletonLoader';
import ItemSubmissionModal from './ItemSubmissionModal';
import RisingFallingSidebar from './RisingFallingSidebar';
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
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortOrder, setSortOrder] = useState('highest'); // 'highest' or 'lowest'
  const [showItemModal, setShowItemModal] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await axios.get('/api/categories');
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchResults(null);
    try {
      const categoryParam = selectedCategory ? `&category_id=${selectedCategory}` : '';
      const sortParam = sortOrder === 'lowest' ? `&sort=lowest` : '';
      const response = await axios.get(`/api/items/ranking?limit=${limit}${categoryParam}${sortParam}`);
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
  }, [limit, selectedCategory, sortOrder]);

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

  const userSessionId = localStorage.getItem('userSessionId');

  return (
    <div className="rankings-container">
      <div className="rankings-header">
        <div className="header-content">
          <h1>🏆 The Best Things Ranking</h1>
          <p>Based on community votes using Elo rating system</p>
        </div>
        
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
          <>
            <div className="category-filter">
              <label>Filter by category:</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="category-select"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.item_count || 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="sort-controls">
              <label>Sort by:</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="sort-select"
              >
                <option value="highest">Highest Rated</option>
                <option value="lowest">Lowest Rated</option>
              </select>
            </div>
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
          </>
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

        <div className="submit-item-wrapper">
          <button 
            className="submit-item-button" 
            onClick={() => setShowItemModal(true)}
            title="Submit a new item to be ranked"
          >
            ➕ Submit New Item
          </button>
        </div>
      </div>

      {error && (
        <div className="rankings-error-banner">
          {error} <button onClick={() => searchQuery ? performSearch(searchQuery) : fetchRankings()} className="retry-link">Try again</button>
        </div>
      )}

      <div className="rankings-content-wrapper">
        <div className="rankings-main-content">
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
                  <div className="rank-title-row">
                    <h3 className="rank-title">{item.title}</h3>
                    {item.category_name && (
                      <span className="category-badge">{item.category_name}</span>
                    )}
                  </div>
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
        <RisingFallingSidebar />
      </div>

      {showItemModal && (
        <ItemSubmissionModal
          onClose={() => setShowItemModal(false)}
          onSuccess={() => {
            // Optionally show a toast or refresh
            setShowItemModal(false);
          }}
          userSessionId={userSessionId}
        />
      )}
    </div>
  );
};

export default Rankings;

