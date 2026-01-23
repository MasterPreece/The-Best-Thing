import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Comments.css';

const CommentItem = ({ comment, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { token, userId } = useAuth();

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    // For older comments, show actual date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleDelete = async () => {
    if (!token || !userId) {
      return;
    }

    // Check if user owns this comment
    if (comment.user_id !== userId) {
      return;
    }

    setDeleting(true);
    try {
      await axios.delete(`/api/comments/${comment.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (onDeleted) {
        onDeleted(comment.id);
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
      alert('Failed to delete comment. Please try again.');
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  const canDelete = token && userId && comment.user_id === userId;
  const displayName = comment.username || 'Anonymous';

  return (
    <div className="comment-item">
      <div className="comment-header">
        <div className="comment-author">
          <span className="comment-author-icon">👤</span>
          <span className="comment-author-name">{displayName}</span>
          {comment.user_id && (
            <span className="comment-author-badge">Registered</span>
          )}
        </div>
        <div className="comment-meta">
          <span className="comment-timestamp" title={new Date(comment.created_at).toLocaleString()}>
            {formatTimestamp(comment.created_at)}
          </span>
          {canDelete && (
            <button
              className="comment-delete-button"
              onClick={() => setShowConfirm(true)}
              disabled={deleting}
              title="Delete comment"
            >
              {deleting ? '...' : '🗑️'}
            </button>
          )}
        </div>
      </div>
      
      {showConfirm && (
        <div className="comment-delete-confirm">
          <span>Delete this comment?</span>
          <div className="comment-delete-actions">
            <button onClick={handleDelete} className="confirm-delete">Yes, delete</button>
            <button onClick={() => setShowConfirm(false)} className="cancel-delete">Cancel</button>
          </div>
        </div>
      )}
      
      <div className="comment-content">
        {comment.content}
      </div>
    </div>
  );
};

export default CommentItem;

