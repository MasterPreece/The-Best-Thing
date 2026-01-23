import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CommentForm from './CommentForm';
import CommentItem from './CommentItem';
import './Comments.css';

const Comments = ({ itemId, itemTitle }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const commentsEndRef = useRef(null);

  const fetchComments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`/api/items/${itemId}/comments`);
      setComments(response.data.comments || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError('Failed to load comments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (itemId) {
      fetchComments();
    }
  }, [itemId]);

  useEffect(() => {
    // Auto-scroll to bottom when new comment is added
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);

  const handleCommentAdded = (newComment) => {
    setComments(prev => [newComment, ...prev]);
  };

  const handleCommentDeleted = (commentId) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const scrollToBottom = () => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="comments-container">
      <div className="comments-header">
        <h3>
          {itemTitle ? `Discussion: ${itemTitle}` : 'Discussion'}
        </h3>
        {comments.length > 0 && (
          <span className="comments-count">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</span>
        )}
      </div>

      <CommentForm 
        itemId={itemId} 
        onCommentAdded={handleCommentAdded}
        onError={(err) => setError(err)}
      />

      {error && (
        <div className="comments-error">
          {error}
          <button onClick={fetchComments} className="retry-button">Retry</button>
        </div>
      )}

      <div className="comments-list">
        {loading ? (
          <div className="comments-loading">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="comments-empty">
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          <>
            {comments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onDeleted={handleCommentDeleted}
              />
            ))}
            <div ref={commentsEndRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default Comments;

