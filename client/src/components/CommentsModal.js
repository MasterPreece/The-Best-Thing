import React, { useEffect, useCallback } from 'react';
import Comments from './Comments';
import './Comments.css';

const CommentsModal = ({ itemId, itemTitle, onClose }) => {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [handleEscape]);

  return (
    <div className="comments-modal" onClick={handleOverlayClick}>
      <div className="comments-modal-content">
        <div className="comments-modal-header">
          <h2>Discussion</h2>
          <button className="comments-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="comments-modal-body">
          <Comments itemId={itemId} itemTitle={itemTitle} />
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;

