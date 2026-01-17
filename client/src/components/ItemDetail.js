import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ItemDetailSkeleton } from './ItemDetailSkeleton';
import PhotoSubmissionModal from './PhotoSubmissionModal';
import './ItemDetail.css';

const ItemDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, token } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchItem = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await axios.get(`/api/items/${id}`);
        setItem(response.data);
        setImageError(false); // Reset image error state when item changes
      } catch (error) {
        console.error('Error fetching item:', error);
        setError('Failed to load item details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchItem();
    }
  }, [id]);

  const fetchComments = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`/api/items/${id}/comments`);
      setComments(response.data.comments || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchComments();
    }
  }, [id, fetchComments]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setCommentLoading(true);
    try {
      const response = await axios.post(`/api/items/${id}/comments`, {
        content: newComment.trim(),
        userSessionId: localStorage.getItem('userSessionId')
      });
      setComments([response.data.comment, ...comments]);
      setNewComment('');
    } catch (error) {
      console.error('Error creating comment:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      await axios.delete(`/api/comments/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  const getWikipediaUrl = (title) => {
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy link');
    });
  };

  const shareOnTwitter = (title) => {
    const url = window.location.href;
    const text = `Check out ${title} on The Best Thing!`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnFacebook = () => {
    const url = window.location.href;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  if (loading) {
    return <ItemDetailSkeleton />;
  }

  if (error || !item) {
    return (
      <div className="item-detail-container">
        <div className="error-state">
          <h2>⚠️ {error || 'Item not found'}</h2>
          <button className="back-button" onClick={() => navigate('/rankings')}>
            ← Back to Rankings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="item-detail-container">
      <div className="item-detail-header">
        <button className="back-button" onClick={() => navigate('/rankings')}>
          ← Back to Rankings
        </button>
        
        <div className="share-buttons">
          <button 
            className="share-btn" 
            onClick={() => copyToClipboard(window.location.href)}
            title="Copy link"
          >
            📋 Copy Link
          </button>
          <button 
            className="share-btn twitter" 
            onClick={() => shareOnTwitter(item.title)}
            title="Share on Twitter"
          >
            🐦 Twitter
          </button>
          <button 
            className="share-btn facebook" 
            onClick={shareOnFacebook}
            title="Share on Facebook"
          >
            📘 Facebook
          </button>
        </div>
      </div>

      <div className="item-detail-content">
        <div className="item-main">
          <div className="item-image-section">
            {item.image_url && !imageError ? (
              <img
                src={item.image_url}
                alt={item.title}
                className="item-detail-image"
                loading="lazy"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x400?text=No+Image';
                  setImageError(true);
                }}
              />
            ) : (
              <div className="item-image-placeholder">
                📷 No Image Available
              </div>
            )}
            {(!item.image_url || imageError || item.image_url === 'https://via.placeholder.com/400x400?text=No+Image') && (
              <button
                type="button"
                className="submit-photo-button"
                onClick={() => setShowPhotoModal(true)}
                title="Submit a photo for this item"
              >
                📷 Submit Photo
              </button>
            )}
          </div>

          <div className="item-info-section">
            <h1 className="item-title">{item.title}</h1>
            
            {item.description && (
              <p className="item-description">{item.description}</p>
            )}

            <div className="item-stats-grid">
              <div className="stat-card rank">
                <div className="stat-label">Ranking</div>
                <div className="stat-value">#{item.rank || 'N/A'}</div>
              </div>
              
              <div className="stat-card rating">
                <div className="stat-label">Elo Rating</div>
                <div className="stat-value">{Math.round(item.elo_rating)}</div>
              </div>
              
              <div className="stat-card win-rate">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value">{item.winRate || 0}%</div>
              </div>
              
              <div className="stat-card comparisons">
                <div className="stat-label">Total Comparisons</div>
                <div className="stat-value">{item.comparison_count || 0}</div>
              </div>
              
              <div className="stat-card wins">
                <div className="stat-label">Wins</div>
                <div className="stat-value">{item.wins || 0}</div>
              </div>
              
              <div className="stat-card losses">
                <div className="stat-label">Losses</div>
                <div className="stat-value">{item.losses || 0}</div>
              </div>
            </div>

            <div className="item-actions">
              <a
                href={getWikipediaUrl(item.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="wikipedia-link"
              >
                📖 View on Wikipedia
              </a>
            </div>
          </div>
        </div>

        {item.topOpponents && item.topOpponents.length > 0 && (
          <div className="section top-opponents">
            <h2>🏆 Most Common Opponents</h2>
            <div className="opponents-grid">
              {item.topOpponents.map((opponent) => (
                <Link
                  key={opponent.id}
                  to={`/items/${opponent.id}`}
                  className="opponent-card"
                >
                  <div className="opponent-image">
                    {opponent.imageUrl ? (
                      <img
                        src={opponent.imageUrl}
                        alt={opponent.title}
                        onError={(e) => {
                          e.target.src = 'https://via.placeholder.com/60x60?text=No+Image';
                        }}
                      />
                    ) : (
                      <div className="opponent-placeholder">📷</div>
                    )}
                  </div>
                  <div className="opponent-info">
                    <div className="opponent-title">{opponent.title}</div>
                    <div className="opponent-stats">
                      <span className="match-count">{opponent.matchCount} matches</span>
                      <span className="win-loss">
                        {opponent.wins}W - {opponent.losses}L
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {item.recentComparisons && item.recentComparisons.length > 0 && (
          <div className="section recent-comparisons">
            <h2>📊 Recent Comparisons</h2>
            <div className="comparisons-list">
              {item.recentComparisons.map((comparison) => (
                <Link
                  key={comparison.id}
                  to={`/items/${comparison.opponent.id}`}
                  className="comparison-item"
                >
                  <div className="comparison-result">
                    <span className={`result-badge ${comparison.won ? 'won' : 'lost'}`}>
                      {comparison.won ? '✅ Won' : '❌ Lost'}
                    </span>
                    <span className="comparison-date">
                      {formatDate(comparison.createdAt)}
                    </span>
                  </div>
                  <div className="comparison-opponent">
                    <span>vs</span>
                    <span className="opponent-name">{comparison.opponent.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {item.created_at && (
          <div className="section metadata">
            <p className="created-date">
              Added to database: {formatDate(item.created_at)}
            </p>
          </div>
        )}

        <div className="section comments-section">
          <h2>💬 Discussions</h2>
          
          <form onSubmit={handleSubmitComment} className="comment-form">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={isAuthenticated ? "Share your thoughts..." : "Login to comment..."}
              disabled={!isAuthenticated || commentLoading}
              maxLength={1000}
              className="comment-input"
              rows={3}
            />
            <div className="comment-form-footer">
              <span className="comment-char-count">{newComment.length}/1000</span>
              <button 
                type="submit" 
                disabled={!isAuthenticated || !newComment.trim() || commentLoading}
                className="comment-submit-btn"
              >
                {commentLoading ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>

          <div className="comments-list">
            {comments.length === 0 ? (
              <p className="no-comments">No comments yet. Be the first to share your thoughts!</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="comment-item">
                  <div className="comment-header">
                    <span className="comment-author">{comment.username || 'Anonymous'}</span>
                    <span className="comment-date">{formatDate(comment.created_at)}</span>
                    {isAuthenticated && user?.id === comment.user_id && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="comment-delete-btn"
                        title="Delete comment"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                  <div className="comment-content">{comment.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showPhotoModal && item && (
        <PhotoSubmissionModal
          item={item}
          onClose={() => setShowPhotoModal(false)}
          onSuccess={() => {
            // Optionally refresh the item to show the new image if approved quickly
            setShowPhotoModal(false);
            alert('Photo submitted! It will be reviewed by an admin.');
          }}
          userSessionId={localStorage.getItem('userSessionId')}
          token={token}
        />
      )}
    </div>
  );
};

export default ItemDetail;

