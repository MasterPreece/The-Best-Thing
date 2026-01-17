import React, { useState } from 'react';
import axios from 'axios';
import './PhotoSubmissionModal.css';

const PhotoSubmissionModal = ({ item, onClose, onSuccess, userSessionId, token }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!imageUrl || !imageUrl.trim()) {
      setError('Please enter an image URL');
      setLoading(false);
      return;
    }

    // Validate URL
    try {
      new URL(imageUrl);
    } catch (err) {
      setError('Please enter a valid URL');
      setLoading(false);
      return;
    }

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post('/api/photo-submissions', {
        itemId: item.id,
        imageUrl: imageUrl.trim(),
        userSessionId
      }, { headers });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error submitting photo:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to submit photo');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="photo-submission-modal-overlay" onClick={onClose}>
        <div className="photo-submission-modal" onClick={(e) => e.stopPropagation()}>
          <div className="photo-submission-success">
            <div className="success-icon">✅</div>
            <h3>Photo Submitted!</h3>
            <p>Your photo has been submitted for review. An admin will review it soon.</p>
            <button onClick={onClose} className="close-button">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="photo-submission-modal-overlay" onClick={onClose}>
      <div className="photo-submission-modal" onClick={(e) => e.stopPropagation()}>
        <div className="photo-submission-header">
          <h2>📷 Submit Photo for {item.title}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="photo-submission-info">
            <p>Help improve the database by submitting a photo for this item!</p>
            <div className="info-box">
              <p><strong>Guidelines:</strong></p>
              <ul>
                <li>Submit a clear, relevant image of the item</li>
                <li>Use a direct image URL (e.g., from imgur, imgbb, or other image hosting)</li>
                <li>Ensure the image is appropriate and related to the item</li>
                <li>Your submission will be reviewed by an admin before being approved</li>
              </ul>
            </div>
          </div>

          <div className="form-group">
            <label>Image URL *</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              required
              disabled={loading}
            />
            <small className="field-hint">
              Paste a direct link to the image (must be a valid image URL)
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Photo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PhotoSubmissionModal;

