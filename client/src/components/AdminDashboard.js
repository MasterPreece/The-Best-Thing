import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './AdminDashboard.css';

const AdminDashboard = ({ adminToken, onLogout }) => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 50; // Fixed limit per page
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState('');

  // Create axios instance with admin auth
  const api = useMemo(() => {
    return axios.create({
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
  }, [adminToken]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      if (search) params.append('search', search);

      const response = await api.get(`/api/admin/items?${params}`);
      setItems(response.data.items || []);
      setPagination(response.data.pagination || {});
      setError('');
    } catch (err) {
      console.error('Error fetching items:', err);
      if (err.response?.status === 401) {
        onLogout();
      } else {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load items';
        setError(`Failed to load items: ${errorMsg}`);
        console.error('Full error:', err.response?.data || err);
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, api, onLogout]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
      if (err.response?.status === 401) {
        onLogout();
      } else {
        console.error('Stats error:', err.response?.data || err);
      }
    }
  }, [api, onLogout]);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page when searching
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
      return;
    }

    try {
      await api.delete(`/api/admin/items/${id}`);
      fetchItems();
      fetchStats();
    } catch (err) {
      if (err.response?.status === 401) {
        onLogout();
      } else {
        alert('Failed to delete item: ' + (err.response?.data?.error || err.message));
      }
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>🔧 Admin Dashboard</h1>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>

      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.totalItems}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalComparisons}</div>
            <div className="stat-label">Total Comparisons</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Registered Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.itemsWithImages}</div>
            <div className="stat-label">Items with Images</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.imageCoverage}%</div>
            <div className="stat-label">Image Coverage</div>
          </div>
        </div>
      )}

      <div className="admin-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={handleSearch}
            className="search-input"
          />
        </div>
        <div className="button-group">
          <button className="add-button" onClick={() => setShowAddModal(true)}>
            ➕ Add New Item
          </button>
          <button className="bulk-import-button" onClick={() => setShowBulkImportModal(true)}>
            📊 Bulk Import
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading">Loading items...</div>
      ) : (
        <>
          <div className="items-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Image</th>
                  <th>Rating</th>
                  <th>Votes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="no-items">
                      No items found{search ? ` matching "${search}"` : ''}
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td className="title-cell">
                        <div className="item-title-row">
                          <div className="item-title">{item.title}</div>
                          {item.category_name && (
                            <span className="category-badge-small">{item.category_name}</span>
                          )}
                        </div>
                        {item.description && (
                          <div className="item-description">{item.description.substring(0, 100)}...</div>
                        )}
                      </td>
                      <td>
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.title} className="item-thumb" />
                        ) : (
                          <span className="no-image">No image</span>
                        )}
                      </td>
                      <td>{Math.round(item.elo_rating || 1500)}</td>
                      <td>{item.comparison_count || 0}</td>
                      <td className="actions-cell">
                        <button 
                          className="edit-button"
                          onClick={() => setEditingItem(item)}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          className="delete-button"
                          onClick={() => handleDelete(item.id)}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span>
                Page {page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button 
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <ItemModal
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}

      {editingItem && (
        <ItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => {
            setEditingItem(null);
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}

      {showBulkImportModal && (
        <BulkImportModal
          onClose={() => setShowBulkImportModal(false)}
          onSuccess={() => {
            setShowBulkImportModal(false);
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}
    </div>
  );
};

// Bulk Import Modal
const BulkImportModal = ({ onClose, onSuccess, api }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(fileExtension)) {
        setError('Please select an Excel (.xlsx, .xls) or CSV file');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setError('');
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/admin/bulk-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
      if (response.data.summary.inserted > 0) {
        // Refresh after a short delay to show the result
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      console.error('Bulk import error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to import file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/api/admin/bulk-import/template', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bulk-import-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download template: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bulk-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Bulk Import Items</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit}>
            <div className="bulk-import-info">
              <p>Upload an Excel (.xlsx, .xls) or CSV file to import multiple items at once.</p>
              
              <div className="format-guide">
                <h4>📋 File Format Requirements</h4>
                <div className="format-table-wrapper">
                  <table className="format-example">
                    <thead>
                      <tr>
                        <th className="required">title <span className="required-badge">Required</span></th>
                        <th>image_url</th>
                        <th>description</th>
                        <th>wikipedia_id</th>
                        <th>category</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Pizza</td>
                        <td>https://example.com/pizza.jpg</td>
                        <td>A delicious Italian dish</td>
                        <td>12345</td>
                        <td>Food & Drinks</td>
                      </tr>
                      <tr>
                        <td>Ice Cream</td>
                        <td>https://example.com/icecream.jpg</td>
                        <td>Frozen dessert</td>
                        <td></td>
                        <td>Food & Drinks</td>
                      </tr>
                      <tr>
                        <td>Chocolate</td>
                        <td></td>
                        <td>Sweet treat</td>
                        <td>67890</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="format-notes">
                  <p><strong>Column Details:</strong></p>
                  <ul>
                    <li><code>title</code> - <span className="required-text">Required</span> - The name of the item</li>
                    <li><code>image_url</code> - Optional - Full URL to an image (e.g., https://example.com/image.jpg)</li>
                    <li><code>description</code> - Optional - A brief description of the item</li>
                    <li><code>wikipedia_id</code> - Optional - Wikipedia page ID (must be a number if provided)</li>
                    <li><code>category</code> - Optional - Category name (e.g., "Food & Drinks", "Movies & TV", "Music", etc.)</li>
                  </ul>
                  <p className="format-tip">💡 <strong>Tip:</strong> You can export a Google Sheet as CSV and upload it directly!</p>
                </div>
              </div>
              
              <button 
                type="button" 
                className="template-button"
                onClick={handleDownloadTemplate}
              >
                📥 Download Template File
              </button>
            </div>

            <div className="form-group">
              <label>Select File</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={loading}
              />
              {file && (
                <div className="file-info">
                  Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
                </div>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="save-button" disabled={loading || !file}>
                {loading ? 'Importing...' : 'Import Items'}
              </button>
            </div>
          </form>
        ) : (
          <div className="import-result">
            <h3>✅ Import Complete!</h3>
            <div className="result-summary">
              <div className="result-stat success">
                <div className="stat-value">{result.summary.inserted}</div>
                <div className="stat-label">Inserted</div>
              </div>
              {result.summary.skipped > 0 && (
                <div className="result-stat warning">
                  <div className="stat-value">{result.summary.skipped}</div>
                  <div className="stat-label">Skipped (duplicates)</div>
                </div>
              )}
              {result.summary.failed > 0 && (
                <div className="result-stat error">
                  <div className="stat-value">{result.summary.failed}</div>
                  <div className="stat-label">Failed</div>
                </div>
              )}
            </div>
            <p className="result-message">{result.message}</p>
            
            {result.errors && result.errors.length > 0 && (
              <div className="result-errors">
                <h4>Validation Errors (first {result.errors.length}):</h4>
                <ul>
                  {result.errors.map((err, idx) => (
                    <li key={idx}>Row {err.row}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button onClick={onClose} className="save-button">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Item Add/Edit Modal
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
            <label>Image URL</label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://example.com/image.jpg"
            />
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

export default AdminDashboard;

