import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './AdminDashboard.css';
import ItemModal from './modals/ItemModal';
import BulkImportModal from './modals/BulkImportModal';
import BulkLookupModal from './modals/BulkLookupModal';
import SeedTop2000Modal from './modals/SeedTop2000Modal';
import SeedPopularCultureModal from './modals/SeedPopularCultureModal';

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
  const [showBulkLookupModal, setShowBulkLookupModal] = useState(false);
  const [showUpdateImagesModal, setShowUpdateImagesModal] = useState(false);
  const [showSeedTop2000Modal, setShowSeedTop2000Modal] = useState(false);
  const [showSeedPopularCultureModal, setShowSeedPopularCultureModal] = useState(false);
  const [showAssignCategoriesModal, setShowAssignCategoriesModal] = useState(false);
  const [showPhotoSubmissions, setShowPhotoSubmissions] = useState(false);
  const [showItemSubmissions, setShowItemSubmissions] = useState(false);
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

      <div className="admin-tools-section">
        <h3 className="admin-tools-title">Admin Tools</h3>
        
        <div className="admin-tools-grid">
          {/* Item Management */}
          <div className="admin-tool-card" onClick={() => setShowAddModal(true)}>
            <div className="tool-icon">➕</div>
            <div className="tool-content">
              <h4 className="tool-title">Add New Item</h4>
              <p className="tool-description">Manually add a single item with title, description, image, and category.</p>
            </div>
          </div>

          {/* Import & Lookup */}
          <div className="admin-tool-card" onClick={() => setShowBulkImportModal(true)}>
            <div className="tool-icon">📊</div>
            <div className="tool-content">
              <h4 className="tool-title">Bulk Import</h4>
              <p className="tool-description">Upload CSV/Excel with complete item data (title, image, description, category).</p>
            </div>
          </div>

          <div className="admin-tool-card" onClick={() => setShowBulkLookupModal(true)}>
            <div className="tool-icon">🔍</div>
            <div className="tool-content">
              <h4 className="tool-title">Bulk Lookup</h4>
              <p className="tool-description">Upload a list of titles - automatically searches Wikipedia and adds items.</p>
            </div>
          </div>

          {/* Seeding */}
          <div className="admin-tool-card" onClick={() => setShowSeedTop2000Modal(true)}>
            <div className="tool-icon">🌱</div>
            <div className="tool-content">
              <h4 className="tool-title">Seed Top Articles</h4>
              <p className="tool-description">Add popular Wikipedia articles sorted by pageviews. Great for initial database setup.</p>
            </div>
          </div>

          <div className="admin-tool-card" onClick={() => setShowSeedPopularCultureModal(true)}>
            <div className="tool-icon">🎬</div>
            <div className="tool-content">
              <h4 className="tool-title">Seed Popular Culture</h4>
              <p className="tool-description">Add familiar items from TV, movies, celebrities, sports, brands, and more.</p>
            </div>
          </div>

          {/* Maintenance */}
          <div className="admin-tool-card" onClick={() => setShowUpdateImagesModal(true)}>
            <div className="tool-icon">🖼️</div>
            <div className="tool-content">
              <h4 className="tool-title">Update Images</h4>
              <p className="tool-description">Find and add images for items missing photos from Wikipedia or Unsplash.</p>
            </div>
          </div>

          <div className="admin-tool-card" onClick={() => setShowAssignCategoriesModal(true)}>
            <div className="tool-icon">🏷️</div>
            <div className="tool-content">
              <h4 className="tool-title">Assign Categories</h4>
              <p className="tool-description">Intelligently assign categories to uncategorized items using Wikipedia data.</p>
            </div>
          </div>

          {/* Submissions */}
          <div className="admin-tool-card" onClick={() => setShowPhotoSubmissions(true)}>
            <div className="tool-icon">📷</div>
            <div className="tool-content">
              <h4 className="tool-title">Photo Submissions</h4>
              <p className="tool-description">Review and approve photos submitted by users for items without images.</p>
            </div>
          </div>

          <div className="admin-tool-card" onClick={() => setShowItemSubmissions(true)}>
            <div className="tool-icon">➕</div>
            <div className="tool-content">
              <h4 className="tool-title">Item Submissions</h4>
              <p className="tool-description">Review and approve new items submitted by users for inclusion.</p>
            </div>
          </div>
        </div>
      </div>

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

      {showBulkLookupModal && (
        <BulkLookupModal
          onClose={() => setShowBulkLookupModal(false)}
          onSuccess={() => {
            setShowBulkLookupModal(false);
            setTimeout(() => {
              fetchItems();
              fetchStats();
            }, 30000); // Refresh after 30 seconds (lookup takes time)
          }}
          api={api}
        />
      )}

      {showUpdateImagesModal && (
        <UpdateImagesModal
          onClose={() => setShowUpdateImagesModal(false)}
          onSuccess={() => {
            setShowUpdateImagesModal(false);
            // Refresh stats after a delay to see updated image counts
            setTimeout(() => {
              fetchStats();
            }, 5000);
          }}
          api={api}
        />
      )}

      {showSeedTop2000Modal && (
        <SeedTop2000Modal
          onClose={() => setShowSeedTop2000Modal(false)}
          onSuccess={() => {
            setShowSeedTop2000Modal(false);
            // Refresh stats after a longer delay (seeding takes 15-20 minutes)
            setTimeout(() => {
              fetchStats();
            }, 60000); // Check after 1 minute
          }}
          api={api}
        />
      )}

      {showSeedPopularCultureModal && (
        <SeedPopularCultureModal
          onClose={() => setShowSeedPopularCultureModal(false)}
          onSuccess={() => {
            setShowSeedPopularCultureModal(false);
            // Refresh stats after a delay (seeding takes time)
            setTimeout(() => {
              fetchStats();
            }, 60000); // Check after 1 minute
          }}
          api={api}
        />
      )}

      {showAssignCategoriesModal && (
        <AssignCategoriesModal
          onClose={() => setShowAssignCategoriesModal(false)}
          onSuccess={() => {
            setShowAssignCategoriesModal(false);
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}

      {showPhotoSubmissions && (
        <PhotoSubmissionsPanel
          onClose={() => setShowPhotoSubmissions(false)}
          onApprove={() => {
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}

      {showItemSubmissions && (
        <ItemSubmissionsPanel
          onClose={() => setShowItemSubmissions(false)}
          onApprove={() => {
            fetchItems();
            fetchStats();
          }}
          api={api}
        />
      )}
    </div>
  );
};


// Assign Categories Modal
const AssignCategoriesModal = ({ onClose, onSuccess, api }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [intelligent, setIntelligent] = useState(true);
  const [limit, setLimit] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const body = {
        intelligent: intelligent
      };
      
      if (limit && limit.trim()) {
        const parsedLimit = parseInt(limit);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
          setError('Limit must be a positive number');
          setLoading(false);
          return;
        }
        body.limit = parsedLimit;
      }

      await api.post('/api/admin/assign-categories', body);

      setSuccess(true);
    } catch (err) {
      console.error('Assign categories error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to assign categories');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🏷️ Assign Categories</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="assign-categories-success">
            <div className="success-icon">✅</div>
            <h3>Category Assignment Started!</h3>
            <p>The category assignment process has been started in the background.</p>
            
            <div className="info-box">
              <p><strong>📋 What happens next:</strong></p>
              <ul>
                <li>The system will fetch Wikipedia categories for each item and match them intelligently.</li>
                <li>Items will be assigned to appropriate categories (Food & Drinks, Movies & TV, Music, etc.).</li>
                <li>Items that cannot be matched will be skipped (you can run default assignment later for those).</li>
                <li>Check the category selector on the rankings page to see updated counts.</li>
                <li>Progress is logged in Railway server logs - check there for detailed matching results.</li>
              </ul>
            </div>
            
            <div className="modal-actions">
              <button onClick={onSuccess} className="save-button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏷️ Assign Categories</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="assign-categories-info">
            <p>This tool intelligently assigns categories to items by analyzing their Wikipedia categories.</p>
            
            <div className="info-box">
              <p><strong>🧠 Intelligent Mode (Recommended):</strong></p>
              <ul>
                <li>Fetches Wikipedia categories for each item</li>
                <li>Matches Wikipedia categories to our category system using keyword analysis</li>
                <li>Assigns items to the best matching category (Food & Drinks, Movies & TV, Music, etc.)</li>
                <li>Items that cannot be matched are skipped (can run default assignment later)</li>
                <li>Takes longer but provides accurate categorization</li>
              </ul>
            </div>
            
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={intelligent}
                  onChange={(e) => setIntelligent(e.target.checked)}
                  disabled={loading}
                />
                <span>Use intelligent category matching (recommended)</span>
              </label>
              <small className="field-hint">
                {intelligent 
                  ? 'Will fetch Wikipedia categories and match them intelligently'
                  : 'Will assign all items to "Other" category (quick but less accurate)'}
              </small>
            </div>

            <div className="form-group">
              <label>
                Limit (Optional)
                <span className="field-hint"> - Leave empty to process all items</span>
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="e.g., 100"
                min="1"
                disabled={loading}
              />
              <small className="field-hint">
                Process only the first N uncategorized items (useful for testing)
              </small>
            </div>
            
            <div className="warning-box">
              <p><strong>⏱️ Timing:</strong></p>
              <ul>
                <li>Intelligent mode: ~{limit ? Math.ceil(parseInt(limit) / 3.3) : '100-200'} seconds ({limit ? limit : '1000'} items = ~5 minutes)</li>
                <li>Default mode: ~5 seconds regardless of item count</li>
                <li>The process respects Wikipedia's rate limits (300ms delay between requests)</li>
                <li>Progress is logged in Railway server logs</li>
              </ul>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Starting...' : 'Assign Categories'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Update Images Modal
const UpdateImagesModal = ({ onClose, onSuccess, api }) => {
  const [limit, setLimit] = useState('');
  const [includePlaceholders, setIncludePlaceholders] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const body = {};
      if (limit && limit.trim()) {
        const parsedLimit = parseInt(limit);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
          setError('Limit must be a positive number');
          setLoading(false);
          return;
        }
        body.limit = parsedLimit;
      }
      if (includePlaceholders) {
        body.includePlaceholders = true;
      }

      await api.post('/api/admin/update-images', body);

      setSuccess(true);
      
      // Close after a delay
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err) {
      console.error('Update images error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to start image update');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🖼️ Update Images</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="update-images-success">
            <div className="success-icon">✅</div>
            <h3>Image Update Started!</h3>
            <p>The image update process has been started in the background.</p>
            <p className="info-text">
              📋 <strong>What happens next:</strong>
            </p>
            <ul className="info-list">
              <li>The system will find items without images</li>
              <li>It will attempt to fetch images from Wikipedia</li>
              <li>If Unsplash is configured, it will try that as well</li>
              <li>Progress is logged in the server console/logs</li>
            </ul>
            <p className="info-text">
              💡 <strong>Tip:</strong> Check the stats section after a few minutes to see updated image counts. The process respects API rate limits and may take some time.
            </p>
            
            <div className="modal-actions">
              <button onClick={onClose} className="save-button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🖼️ Update Images</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="update-images-info">
            <p>This will search for items without images and attempt to fetch images from Wikipedia and Unsplash.</p>
            
            <div className="info-box">
              <p><strong>How it works:</strong></p>
              <ul>
                <li>Finds items with missing or placeholder images</li>
                <li>Tries to fetch images from Wikipedia first</li>
                <li>Falls back to Unsplash (if configured)</li>
                <li>Only updates items that get real images (unless "Include Placeholders" is checked)</li>
              </ul>
            </div>
          </div>

          <div className="form-group">
            <label>
              Limit (Optional)
              <span className="field-hint"> - Leave empty to process all items</span>
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g., 100"
              min="1"
              disabled={loading}
            />
            <small className="field-hint">Process only the first N items without images</small>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includePlaceholders}
                onChange={(e) => setIncludePlaceholders(e.target.checked)}
                disabled={loading}
              />
              <span>Include placeholder images</span>
            </label>
            <small className="field-hint">If checked, items will be updated even if only a placeholder image is found</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Starting...' : 'Start Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Photo Submissions Panel
const PhotoSubmissionsPanel = ({ onClose, onApprove, api }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [toast, setToast] = useState(null);
  const limit = 20;

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/admin/photo-submissions?status=pending&limit=${limit}&offset=${(page - 1) * limit}`);
      setSubmissions(response.data.submissions || []);
      setPagination(response.data.pagination || {});
      setError('');
    } catch (err) {
      console.error('Error fetching photo submissions:', err);
      if (err.response?.status === 401) {
        onClose();
        window.location.reload();
      } else {
        setError(err.response?.data?.error || 'Failed to load photo submissions');
      }
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, onClose]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleApprove = async (submissionId) => {
    try {
      await api.post(`/api/admin/photo-submissions/${submissionId}/approve`);
      showToast('Photo approved!', 'success');
      fetchSubmissions();
      onApprove();
    } catch (err) {
      console.error('Error approving photo:', err);
      alert('Failed to approve photo: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReject = async (submissionId) => {
    if (!window.confirm('Are you sure you want to reject this photo submission?')) {
      return;
    }
    try {
      await api.post(`/api/admin/photo-submissions/${submissionId}/reject`);
      showToast('Photo rejected', 'info');
      fetchSubmissions();
    } catch (err) {
      console.error('Error rejecting photo:', err);
      alert('Failed to reject photo: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="photo-submissions-panel-overlay" onClick={onClose}>
      <div className="photo-submissions-panel" onClick={(e) => e.stopPropagation()}>
        <div className="photo-submissions-header">
          <h2>📷 Photo Submissions</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="no-submissions">
            <p>No pending photo submissions</p>
          </div>
        ) : (
          <>
            <div className="submissions-list">
              {submissions.map((submission) => (
                <div key={submission.id} className="submission-item">
                  <div className="submission-images">
                    <div className="submission-image-group">
                      <label>Current Image</label>
                      <div className="image-preview">
                        {submission.current_image_url ? (
                          <img src={submission.current_image_url} alt="Current" />
                        ) : (
                          <div className="no-image">No image</div>
                        )}
                      </div>
                    </div>
                    <div className="submission-image-group">
                      <label>Submitted Image</label>
                      <div className="image-preview">
                        <img src={submission.image_url} alt="Submitted" onError={(e) => {
                          e.target.parentElement.innerHTML = '<div class="no-image">Invalid image URL</div>';
                        }} />
                      </div>
                    </div>
                  </div>
                  <div className="submission-info">
                    <h3>{submission.item_title}</h3>
                    <p><strong>Submitted by:</strong> {submission.submitter_username || `Anonymous (${submission.user_session_id?.substring(0, 20)}...)`}</p>
                    <p><strong>Submitted:</strong> {new Date(submission.submitted_at).toLocaleString()}</p>
                  </div>
                  <div className="submission-actions">
                    <button
                      className="approve-button"
                      onClick={() => handleApprove(submission.id)}
                    >
                      ✅ Approve
                    </button>
                    <button
                      className="reject-button"
                      onClick={() => handleReject(submission.id)}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </button>
                <span>Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
                <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Item Submissions Panel
const ItemSubmissionsPanel = ({ onClose, onApprove, api }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [toast, setToast] = useState(null);
  const limit = 20;

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/admin/item-submissions?status=pending&limit=${limit}&offset=${(page - 1) * limit}`);
      setSubmissions(response.data.submissions || []);
      setPagination(response.data.pagination || {});
      setError('');
    } catch (err) {
      console.error('Error fetching item submissions:', err);
      if (err.response?.status === 401) {
        onClose();
        window.location.reload();
      } else {
        setError(err.response?.data?.error || 'Failed to load item submissions');
      }
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, onClose]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleApprove = async (submissionId) => {
    try {
      await api.post(`/api/admin/item-submissions/${submissionId}/approve`);
      showToast('Item approved and added to database!', 'success');
      fetchSubmissions();
      onApprove();
    } catch (err) {
      console.error('Error approving item:', err);
      alert('Failed to approve item: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReject = async (submissionId) => {
    const reason = prompt('Enter reason for rejection (optional):');
    if (reason === null) return; // User cancelled
    
    try {
      await api.post(`/api/admin/item-submissions/${submissionId}/reject`, { reason: reason || null });
      showToast('Item rejected', 'info');
      fetchSubmissions();
    } catch (err) {
      console.error('Error rejecting item:', err);
      alert('Failed to reject item: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="photo-submissions-panel-overlay" onClick={onClose}>
      <div className="photo-submissions-panel" onClick={(e) => e.stopPropagation()}>
        <div className="photo-submissions-header">
          <h2>➕ Item Submissions</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="no-submissions">
            <p>No pending item submissions</p>
          </div>
        ) : (
          <>
            <div className="submissions-list">
              {submissions.map((submission) => (
                <div key={submission.id} className="submission-item">
                  <div className="submission-images" style={{ minHeight: '150px' }}>
                    {submission.image_url ? (
                      <div className="submission-image-group">
                        <label>Image</label>
                        <div className="image-preview">
                          <img src={submission.image_url} alt={submission.title} onError={(e) => {
                            e.target.parentElement.innerHTML = '<div class="no-image">Invalid image URL</div>';
                          }} />
                        </div>
                      </div>
                    ) : (
                      <div className="no-image-placeholder">No image provided</div>
                    )}
                  </div>
                  <div className="submission-info">
                    <h3>{submission.title}</h3>
                    {submission.description && (
                      <p><strong>Description:</strong> {submission.description}</p>
                    )}
                    {submission.wikipedia_url && (
                      <p><strong>Wikipedia:</strong> <a href={submission.wikipedia_url} target="_blank" rel="noopener noreferrer">View</a></p>
                    )}
                    {submission.category_name && (
                      <p><strong>Category:</strong> {submission.category_name}</p>
                    )}
                    <p><strong>Submitted by:</strong> {submission.submitter_username || `Anonymous (${submission.user_session_id?.substring(0, 20)}...)`}</p>
                    <p><strong>Submitted:</strong> {new Date(submission.submitted_at).toLocaleString()}</p>
                  </div>
                  <div className="submission-actions">
                    <button
                      className="approve-button"
                      onClick={() => handleApprove(submission.id)}
                    >
                      ✅ Approve
                    </button>
                    <button
                      className="reject-button"
                      onClick={() => handleReject(submission.id)}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </button>
                <span>Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
                <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;

