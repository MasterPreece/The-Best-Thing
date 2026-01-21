import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ItemModal = ({ item, onClose, onSave, api }) => {
  const [formData, setFormData] = useState({
    title: item?.title || '',
    imageUrl: item?.image_url || '',
    description: item?.description || '',
    wikipediaId: item?.wikipedia_id || '',
    categoryId: item?.category_id || ''
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imagePreviewError, setImagePreviewError] = useState(false);

  useEffect(() => {
    // Fetch categories
    axios.get('/api/categories').then(response => {
      setCategories(response.data.categories || []);
    }).catch(err => {
      console.error('Error fetching categories:', err);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = {
        title: formData.title.trim(),
        imageUrl: formData.imageUrl.trim() || null,
        description: formData.description.trim() || null,
        wikipediaId: formData.wikipediaId ? parseInt(formData.wikipediaId) : null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null
      };

      if (item) {
        await api.put(`/api/admin/items/${item.id}`, data);
      } else {
        await api.post('/api/admin/items', data);
      }
      
      onSave();
    } catch (err) {
      if (err.response?.status === 401) {
        onClose();
        window.location.reload();
      } else {
        setError(err.response?.data?.error || 'Failed to save item');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{item ? 'Edit Item' : 'Add New Item'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="Item title"
            />
          </div>

          <div className="form-group">
            <label>
              Image URL <span className="required-asterisk">*</span>
              <span className="field-description">(Required for items to appear in comparisons)</span>
            </label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => {
                setFormData({ ...formData, imageUrl: e.target.value });
                setImagePreviewError(false);
              }}
              placeholder="https://example.com/image.jpg"
              className={!formData.imageUrl || formData.imageUrl.trim() === '' ? 'warning-input' : ''}
            />
            {(!formData.imageUrl || formData.imageUrl.trim() === '') && (
              <div className="warning-message">
                ⚠️ Warning: Items without images will not appear in comparisons. Please add an image URL.
              </div>
            )}
            {formData.imageUrl && formData.imageUrl.trim() !== '' && (
              <div className="image-preview-container">
                <img
                  src={formData.imageUrl}
                  alt="Preview"
                  className={`image-preview ${imagePreviewError ? 'preview-error' : ''}`}
                  onError={() => setImagePreviewError(true)}
                  onLoad={() => setImagePreviewError(false)}
                />
                {imagePreviewError && (
                  <div className="preview-error-message">
                    ❌ Could not load image. Please check the URL.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Item description (optional)"
              rows="4"
            />
          </div>

          <div className="form-group">
            <label>Wikipedia ID</label>
            <input
              type="number"
              value={formData.wikipediaId}
              onChange={(e) => setFormData({ ...formData, wikipediaId: e.target.value })}
              placeholder="Wikipedia page ID (optional)"
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={formData.categoryId || ''}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">No Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ItemModal;

