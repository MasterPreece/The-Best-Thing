import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';
import AccountPrompt from './AccountPrompt';
import './Comparison.css';

const Comparison = ({ userSessionId }) => {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [itemStats, setItemStats] = useState({ item1: null, item2: null });
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [comparisonCount, setComparisonCount] = useState(0);
  const { token, isAuthenticated } = useAuth();

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    setError(null);
    setItemStats({ item1: null, item2: null });
    
    try {
      const response = await axios.get('/api/comparison');
      setItems(response.data);
      
      // Fetch detailed stats for hover display
      if (response.data?.item1?.id && response.data?.item2?.id) {
        Promise.all([
          axios.get(`/api/items/${response.data.item1.id}`),
          axios.get(`/api/items/${response.data.item2.id}`)
        ]).then(([item1Res, item2Res]) => {
          setItemStats({
            item1: item1Res.data,
            item2: item2Res.data
          });
        }).catch(err => {
          console.error('Error fetching item stats:', err);
          // Non-critical, continue without stats
        });
      }
    } catch (error) {
      console.error('Error fetching comparison:', error);
      const errorMessage = error.response?.status === 404
        ? 'Not enough items in database. The database is growing, please try again in a moment!'
        : error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your internet connection.'
        : 'Failed to load comparison. Please try again.';
      
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkComparisonCount = useCallback(async () => {
    if (!userSessionId) return;
    
    try {
      const response = await axios.get(`/api/comparison/count?sessionId=${userSessionId}`);
      setComparisonCount(response.data.count || 0);
      
      // Show prompt if user has 10+ comparisons and isn't authenticated
      if (response.data.count >= 10 && !isAuthenticated && !localStorage.getItem('accountPromptShown')) {
        setShowAccountPrompt(true);
        localStorage.setItem('accountPromptShown', 'true');
      }
    } catch (error) {
      console.error('Error checking comparison count:', error);
    }
  }, [userSessionId, isAuthenticated]);

  useEffect(() => {
    fetchComparison();
    
    // Check comparison count for anonymous users
    if (!isAuthenticated && userSessionId) {
      checkComparisonCount();
    }
  }, [fetchComparison, isAuthenticated, userSessionId, checkComparisonCount]);

  const handleVote = useCallback(async (winnerId) => {
    if (voting || !items || loading) return;
    
    setSelected(winnerId);
    setVoting(true);
    setError(null);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post('/api/comparison/vote', {
        item1Id: items.item1.id,
        item2Id: items.item2.id,
        winnerId,
        userSessionId
      }, { headers });

      // Check if we should prompt for account
      if (response.data.shouldPromptAccount && !isAuthenticated) {
        setComparisonCount(response.data.comparisonCount || 0);
        if (!localStorage.getItem('accountPromptShown')) {
          setShowAccountPrompt(true);
          localStorage.setItem('accountPromptShown', 'true');
        }
      }

      showToast('Vote recorded! Loading next comparison...', 'success');

      // Wait a moment to show the selection, then fetch new comparison
      setTimeout(() => {
        fetchComparison();
        // Update comparison count
        if (!isAuthenticated && userSessionId) {
          checkComparisonCount();
        }
      }, 1000);
    } catch (error) {
      console.error('Error submitting vote:', error);
      const errorMessage = error.response?.status === 400
        ? 'Invalid vote. Please try again.'
        : error.code === 'ERR_NETWORK'
        ? 'Network error. Please check your connection and try again.'
        : 'Failed to submit vote. Please try again.';
      
      setError(errorMessage);
      showToast(errorMessage, 'error');
      setSelected(null);
    } finally {
      setVoting(false);
    }
  }, [voting, items, loading, token, userSessionId, isAuthenticated, fetchComparison, checkComparisonCount]);

  const handleSkip = useCallback(async () => {
    if (voting || loading) return;
    
    showToast('Skipped! Loading next comparison...', 'info');
    fetchComparison();
  }, [voting, loading, fetchComparison]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (voting || loading || !items) return;
      
      // Prevent keyboard shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleVote(items.item1.id);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleVote(items.item2.id);
      } else if (e.key === ' ' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [items, voting, loading, handleVote, handleSkip]);

  const handleAccountPromptClose = () => {
    setShowAccountPrompt(false);
  };

  const handleAccountCreated = () => {
    setShowAccountPrompt(false);
    localStorage.removeItem('accountPromptShown');
    showToast('Account created! Your votes are now tracked.', 'success');
  };

  if (loading && !items) {
    return (
      <div className="comparison-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading comparison...</div>
        </div>
      </div>
    );
  }

  if (error && !items) {
    return (
      <div className="comparison-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button onClick={fetchComparison} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="comparison-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <div className="error-message">Failed to load comparison</div>
          <button onClick={fetchComparison} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isItem1Selected = selected === items.item1.id;
  const isItem2Selected = selected === items.item2.id;

  return (
    <div className="comparison-container">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}

      {showAccountPrompt && !isAuthenticated && (
        <AccountPrompt
          onClose={handleAccountPromptClose}
          onRegister={handleAccountCreated}
          comparisonCount={comparisonCount}
        />
      )}

      <div className="comparison-header">
        <h1>Which is the Better Thing? 🎯</h1>
        <p className="subtitle">
          Click on the one you think is better!
          <br />
          <span className="keyboard-hint">
            💡 Use ← → arrows or A/D keys to vote • Space/S to skip
          </span>
        </p>
      </div>

      <div className="comparison-controls">
        <button
          onClick={handleSkip}
          disabled={voting || loading}
          className="skip-button"
          title="Skip this comparison (Space or S)"
        >
          ⏭ Skip
        </button>
      </div>

      <div className="comparison-grid">
        <div
          className={`comparison-item ${isItem1Selected ? 'selected winner' : ''} ${
            isItem2Selected ? 'loser' : ''
          } ${voting ? 'voting' : ''}`}
          onClick={() => handleVote(items.item1.id)}
          role="button"
          tabIndex={0}
          aria-label={`Vote for ${items.item1.title}`}
        >
          <div className="item-image-container">
            {items.item1.image_url ? (
              <img
                src={items.item1.image_url}
                alt={items.item1.title}
                className="item-image"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                }}
              />
            ) : (
              <div className="item-placeholder">No Image</div>
            )}
            {itemStats.item1 && (
              <div className="item-hover-stats">
                <div className="hover-stat">
                  <strong>Rating:</strong> {Math.round(itemStats.item1.elo_rating)}
                </div>
                <div className="hover-stat">
                  <strong>Votes:</strong> {itemStats.item1.comparison_count || 0}
                </div>
                <div className="hover-stat">
                  <strong>W/L:</strong> {itemStats.item1.wins || 0}/{itemStats.item1.losses || 0}
                </div>
              </div>
            )}
          </div>
          <div className="item-info">
            <h2 className="item-title">{items.item1.title}</h2>
            {isItem1Selected && <div className="vote-badge">✓ Voted!</div>}
            {voting && !isItem1Selected && (
              <div className="vote-loading">Processing...</div>
            )}
          </div>
        </div>

        <div className="vs-divider">
          <span>VS</span>
        </div>

        <div
          className={`comparison-item ${isItem2Selected ? 'selected winner' : ''} ${
            isItem1Selected ? 'loser' : ''
          } ${voting ? 'voting' : ''}`}
          onClick={() => handleVote(items.item2.id)}
          role="button"
          tabIndex={0}
          aria-label={`Vote for ${items.item2.title}`}
        >
          <div className="item-image-container">
            {items.item2.image_url ? (
              <img
                src={items.item2.image_url}
                alt={items.item2.title}
                className="item-image"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                }}
              />
            ) : (
              <div className="item-placeholder">No Image</div>
            )}
            {itemStats.item2 && (
              <div className="item-hover-stats">
                <div className="hover-stat">
                  <strong>Rating:</strong> {Math.round(itemStats.item2.elo_rating)}
                </div>
                <div className="hover-stat">
                  <strong>Votes:</strong> {itemStats.item2.comparison_count || 0}
                </div>
                <div className="hover-stat">
                  <strong>W/L:</strong> {itemStats.item2.wins || 0}/{itemStats.item2.losses || 0}
                </div>
              </div>
            )}
          </div>
          <div className="item-info">
            <h2 className="item-title">{items.item2.title}</h2>
            {isItem2Selected && <div className="vote-badge">✓ Voted!</div>}
            {voting && !isItem2Selected && (
              <div className="vote-loading">Processing...</div>
            )}
          </div>
        </div>
      </div>

      <div className="comparison-stats">
        <div className="stat-item">
          <strong>Rating:</strong> {Math.round(items.item1.elo_rating)} vs{' '}
          {Math.round(items.item2.elo_rating)}
        </div>
        {error && (
          <div className="stat-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default Comparison;
