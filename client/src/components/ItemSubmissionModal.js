import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './ItemSubmissionModal.css';

const ItemSubmissionModal = ({ onClose, onSuccess, userSessionId }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageUrl: '',
    wikipediaUrl: '',
    categoryId: ''
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    // Fetch categories for dropdown
    axios.get('/api/categories').then(response => {
      setCategories(response.data.categories || []);
    }).catch(err => {
      console.error('Error fetching categories:', err);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }

    setLoading(true);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        imageUrl: formData.imageUrl.trim() || null,
        wikipediaUrl: formData.wikipediaUrl.trim() || null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        userSessionId: userSessionId // Always send session ID for anonymous tracking
      };

      const response = await axios.post('/api/item-submissions', payload, { headers });
      setSuccess(response.data.message);
      setTimeout(() => {
        onSuccess(); // Trigger parent to refresh or show toast
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error submitting item:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content item-submission-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Submit New Item</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Item Title *</label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., The Godfather, iPhone 15, etc."
              required
              disabled={loading || success}
              maxLength={255}
            />
            <small className="field-hint">The name of the item you want to add to the rankings</small>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (Optional)</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the item..."
              rows="3"
              disabled={loading || success}
              maxLength={1000}
            />
            <small className="field-hint">{formData.description.length}/1000 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="imageUrl">Image URL (Optional)</label>
            <input
              type="url"
              id="imageUrl"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://example.com/image.jpg"
              disabled={loading || success}
            />
            <small className="field-hint">Direct link to an image of this item</small>
          </div>

          <div className="form-group">
            <label htmlFor="wikipediaUrl">Wikipedia URL (Optional)</label>
            <input
              type="url"
              id="wikipediaUrl"
              value={formData.wikipediaUrl}
              onChange={(e) => setFormData({ ...formData, wikipediaUrl: e.target.value })}
              placeholder="https://en.wikipedia.org/wiki/..."
              disabled={loading || success}
            />
            <small className="field-hint">Link to the item's Wikipedia page (if available)</small>
          </div>

          <div className="form-group">
            <label htmlFor="categoryId">Category (Optional)</label>
            <select
              id="categoryId"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              disabled={loading || success}
            >
              <option value="">No Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <small className="field-hint">Select a category if applicable</small>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="info-box">
            <p><strong>📋 Note:</strong> Your submission will be reviewed by an admin before being added to the rankings. This helps ensure quality and prevents duplicates.</p>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Close
            </button>
            <button type="submit" className="save-button" disabled={loading || success}>
              {loading ? 'Submitting...' : 'Submit Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ItemSubmissionModal;
