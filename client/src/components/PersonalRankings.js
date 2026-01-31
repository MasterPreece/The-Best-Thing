import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { RankingSkeleton } from './SkeletonLoader';
import CommentsModal from './CommentsModal';
import Toast from './Toast';
import './PersonalRankings.css';

const PersonalRankings = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [commentsModal, setCommentsModal] = useState({ open: false, itemId: null, itemTitle: null });
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPersonalRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/rankings/user/${encodeURIComponent(username)}`);
      setRankings(response.data.rankings || []);
      setUserInfo({
        username: response.data.username,
        userId: response.data.userId,
        total: response.data.total
      });
    } catch (error) {
      console.error('Error fetching personal rankings:', error);
      if (error.response?.status === 404) {
        setError('User not found');
      } else {
        const errorMessage = error.code === 'ERR_NETWORK'
          ? 'Network error. Please check your internet connection.'
          : 'Failed to load personal rankings. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchPersonalRankings();
  }, [fetchPersonalRankings]);

  const handleShare = async () => {
    const url = `${window.location.origin}/rankings/user/${encodeURIComponent(username)}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${username}'s Personal Rankings - The Best Thing`,
          text: `Check out ${username}'s personal rankings on The Best Thing!`,
          url: url
        });
        showToast('Shared successfully!', 'success');
      } catch (error) {
        if (error.name !== 'AbortError') {
          copyToClipboard(url);
        }
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (url) => {
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

  const isOwnRankings = isAuthenticated && user?.username === username;

  if (loading) {
    return (
      <div className="personal-rankings-container">
        <RankingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="personal-rankings-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          {error === 'User not found' && (
            <button onClick={() => navigate('/rankings')} className="retry-button">
              View Global Rankings
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="personal-rankings-container">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="personal-rankings-header">
        <div className="header-content">
          <h1>
            {isOwnRankings ? 'My Personal Rankings' : `${username}'s Rankings`}
          </h1>
          <p className="header-subtitle">
            Rankings based on voting history
            {userInfo && ` • ${userInfo.total} items ranked`}
          </p>
        </div>
        <div className="header-actions">
          <button onClick={handleShare} className="share-button" title="Share these rankings">
            📤 Share
          </button>
          <Link to="/rankings" className="view-global-button">
            View Global Rankings
          </Link>
        </div>
      </div>

      {rankings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h2>No Rankings Yet</h2>
          <p>
            {isOwnRankings 
              ? "Start voting on comparisons to build your personal rankings!"
              : `${username} hasn't voted on any comparisons yet.`}
          </p>
          {isOwnRankings && (
            <Link to="/" className="start-voting-button">
              Start Voting
            </Link>
          )}
        </div>
      ) : (
        <div className="rankings-list">
          {rankings.map((item, index) => (
            <div key={item.id} className="ranking-item personal-ranking-item">
              <div className="rank-number">#{index + 1}</div>
              <Link to={`/items/${item.id}`} className="ranking-item-content">
                <div className="item-image-wrapper">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.title}
                      className="item-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="item-placeholder">No Image</div>
                  )}
                </div>
                <div className="item-info">
                  <h3 className="item-title">{item.title}</h3>
                  {item.description && (
                    <p className="item-description">
                      {item.description.length > 150 
                        ? `${item.description.substring(0, 150)}...` 
                        : item.description}
                    </p>
                  )}
                  <div className="rank-stats">
                    <div className="stat">
                      <strong>Personal Score:</strong> {item.personal_score?.toFixed(1)}%
                    </div>
                    <div className="stat">
                      <strong>Wins:</strong> {item.personal_wins || 0} / {item.personal_total || 0}
                    </div>
                    {item.comment_count > 0 && (
                      <div className="stat">
                        <strong>💬</strong> {item.comment_count}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
              <div className="rank-actions">
                <button
                  className="view-discussion-button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCommentsModal({ open: true, itemId: item.id, itemTitle: item.title });
                  }}
                  title="View discussion"
                >
                  💬 Discuss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

export default PersonalRankings;

