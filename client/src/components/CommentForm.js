import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Comments.css';

const CommentForm = ({ itemId, onCommentAdded, onError }) => {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const { token, isAuthenticated } = useAuth();
  
  // Get userSessionId from localStorage (for anonymous users)
  const userSessionId = localStorage.getItem('userSessionId');
  const MAX_LENGTH = 1000;
  const MIN_LENGTH = 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (content.trim().length < MIN_LENGTH) {
      setError('Comment cannot be empty');
      return;
    }

    if (content.length > MAX_LENGTH) {
      setError(`Comment must be ${MAX_LENGTH} characters or less`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const config = {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      };

      const response = await axios.post(
        `/api/items/${itemId}/comments`,
        {
          content: content.trim(),
          userSessionId: userSessionId || null
        },
        config
      );

      if (response.data.comment) {
        setContent('');
        if (onCommentAdded) {
          onCommentAdded(response.data.comment);
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to post comment. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remainingChars = MAX_LENGTH - content.length;
  const isDisabled = submitting || content.trim().length < MIN_LENGTH || content.length > MAX_LENGTH;

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <div className="comment-form-header">
        <h3>Add a Comment</h3>
        {!isAuthenticated && (
          <span className="comment-form-hint">You're commenting as Anonymous</span>
        )}
      </div>
      
      <textarea
        className="comment-textarea"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setError(null);
        }}
        placeholder="Share your thoughts about this item..."
        rows={4}
        maxLength={MAX_LENGTH}
        disabled={submitting}
      />
      
      <div className="comment-form-footer">
        <div className="comment-form-actions">
          <span className={`char-counter ${remainingChars < 50 ? 'char-counter-warning' : ''}`}>
            {remainingChars} characters remaining
          </span>
          <button
            type="submit"
            className="comment-submit-button"
            disabled={isDisabled}
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
        {error && (
          <div className="comment-form-error">
            {error}
          </div>
        )}
      </div>
    </form>
  );
};

export default CommentForm;

