import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';
import AccountPrompt from './AccountPrompt';
import TrendingItems from './TrendingItems';
import CommentsModal from './CommentsModal';
import { ComparisonSkeleton } from './SkeletonLoader';
import { animateNumber } from '../utils/numberAnimation';
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
  const [globalStats, setGlobalStats] = useState(null);
  const [commentsModal, setCommentsModal] = useState({ open: false, itemId: null, itemTitle: null });
  const { token, isAuthenticated } = useAuth();
  const statsRef = useRef(null);

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
    
    // Reset opacity if it was faded out
    const grid = document.querySelector('.comparison-grid');
    if (grid) {
      grid.style.opacity = '1';
      grid.style.transition = 'opacity 0.3s';
    }
    
    try {
      // Get session ID from localStorage to pass to backend for user-specific cooldown
      const sessionId = localStorage.getItem('userSessionId');
      const url = sessionId ? `/api/comparison?sessionId=${encodeURIComponent(sessionId)}` : '/api/comparison';
      const response = await axios.get(url);
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

  const fetchGlobalStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/stats');
      const newStats = response.data;
      
      // Animate number changes if stats already exist
      setGlobalStats(prevStats => {
        if (prevStats && statsRef.current) {
          const elements = {
            totalComparisons: statsRef.current.querySelector('.stat-total-comparisons'),
            totalItems: statsRef.current.querySelector('.stat-total-items'),
            todayComparisons: statsRef.current.querySelector('.stat-today-comparisons')
          };
          
          if (elements.totalComparisons && newStats.totalComparisons !== prevStats.totalComparisons) {
            animateNumber(elements.totalComparisons, prevStats.totalComparisons, newStats.totalComparisons, 800);
          }
          if (elements.totalItems && newStats.totalItems !== prevStats.totalItems) {
            animateNumber(elements.totalItems, prevStats.totalItems, newStats.totalItems, 800);
          }
          if (elements.todayComparisons && newStats.todayComparisons !== prevStats.todayComparisons) {
            animateNumber(elements.todayComparisons, prevStats.todayComparisons, newStats.todayComparisons, 800);
          }
        }
        return newStats;
      });
    } catch (error) {
      console.error('Error fetching global stats:', error);
      // Non-critical, continue without stats
    }
  }, []);

  useEffect(() => {
    fetchComparison();
    fetchGlobalStats();
    
    // Check comparison count for anonymous users
    if (!isAuthenticated && userSessionId) {
      checkComparisonCount();
    }
  }, [fetchComparison, fetchGlobalStats, isAuthenticated, userSessionId, checkComparisonCount]);

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

      // Show upset pick feedback if user picked an underdog
      if (response.data.wasUpset) {
        showToast('🎯 Upset pick! You chose the underdog!', 'success');
      }

      // Wait a moment to show the selection with animation, then fetch new comparison
      setTimeout(() => {
        // Add a brief fade-out effect before loading next
        if (document.querySelector('.comparison-grid')) {
          document.querySelector('.comparison-grid').style.opacity = '0.5';
          document.querySelector('.comparison-grid').style.transition = 'opacity 0.3s';
        }
        
        setTimeout(() => {
          fetchComparison();
          fetchGlobalStats(); // Update global stats after vote
          // Update comparison count
          if (!isAuthenticated && userSessionId) {
            checkComparisonCount();
          }
        }, 200);
      }, 800);
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
  }, [voting, items, loading, token, userSessionId, isAuthenticated, fetchComparison, fetchGlobalStats, checkComparisonCount]);

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

  const handleShare = async () => {
    if (!items) return;
    
    const shareText = `Which is better: ${items.item1.title} vs ${items.item2.title}? Vote on The Best Thing!`;
    const shareUrl = window.location.href;
    
    // Try native share API (mobile/desktop)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'The Best Thing - Vote Now!',
          text: shareText,
          url: shareUrl
        });
        showToast('Shared successfully!', 'success');
      } catch (error) {
        // User cancelled or error
        if (error.name !== 'AbortError') {
          copyToClipboard(shareUrl, shareText);
        }
      }
    } else {
      // Fallback: copy to clipboard
      copyToClipboard(shareUrl, shareText);
    }
  };

  const copyToClipboard = (url, text) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
      } catch (err) {
        showToast('Failed to copy link', 'error');
      }
      document.body.removeChild(textArea);
    });
  };

  const getWikipediaUrl = (title) => {
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  };

  if (loading && !items) {
    return <ComparisonSkeleton />;
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
        <h1>What is the Best Thing? 🎯</h1>
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
                loading="lazy"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                }}
              />
            ) : (
              <div className="item-placeholder">No Image</div>
            )}
            <button
              type="button"
              className="discuss-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCommentsModal({ open: true, itemId: items.item1.id, itemTitle: items.item1.title });
              }}
              title="Discuss this item"
            >
              💬 Discuss
            </button>
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
            <h2 className="item-title">
              <a
                href={getWikipediaUrl(items.item1.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="item-title-link"
                onClick={(e) => e.stopPropagation()}
                title="Learn more on Wikipedia"
              >
                {items.item1.title}
              </a>
            </h2>
            {items.item1.description && (
              <p className="item-description">{items.item1.description}</p>
            )}
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
                loading="lazy"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
                }}
              />
            ) : (
              <div className="item-placeholder">No Image</div>
            )}
            <button
              type="button"
              className="discuss-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCommentsModal({ open: true, itemId: items.item2.id, itemTitle: items.item2.title });
              }}
              title="Discuss this item"
            >
              💬 Discuss
            </button>
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
            <h2 className="item-title">
              <a
                href={getWikipediaUrl(items.item2.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="item-title-link"
                onClick={(e) => e.stopPropagation()}
                title="Learn more on Wikipedia"
              >
                {items.item2.title}
              </a>
            </h2>
            {items.item2.description && (
              <p className="item-description">{items.item2.description}</p>
            )}
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

      <div className="comparison-instructions">
        <p className="subtitle">
          Click on the one you think is better!
          <br />
          <span className="keyboard-hint">
            💡 Use ← → arrows or A/D keys to vote • Space/S to skip
          </span>
        </p>
        {globalStats && (
          <div className="global-stats" ref={statsRef}>
            <div className="stat-badge">
              <strong className="stat-total-comparisons">{globalStats.totalComparisons.toLocaleString()}</strong> total votes
            </div>
            <div className="stat-badge">
              <strong className="stat-total-items">{globalStats.totalItems.toLocaleString()}</strong> items ranked
            </div>
            <div className="stat-badge highlight">
              <strong className="stat-today-comparisons">{globalStats.todayComparisons.toLocaleString()}</strong> today
            </div>
          </div>
        )}
        <div className="comparison-controls">
          <button
            onClick={handleSkip}
            disabled={voting || loading}
            className="skip-button"
            title="Skip this comparison (Space or S)"
          >
            ►►► Skip
          </button>
          <button
            onClick={handleShare}
            disabled={voting || loading}
            className="share-button"
            title="Share this comparison"
          >
            📤 Share
          </button>
        </div>
      </div>

      <TrendingItems />

      {commentsModal.open && (
        <CommentsModal
          itemId={commentsModal.itemId}
          itemTitle={commentsModal.itemTitle}
          onClose={() => setCommentsModal({ open: false, itemId: null, itemTitle: null })}
        />
      )}
    </div>
  );
};

export default Comparison;
