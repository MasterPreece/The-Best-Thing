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

// Bulk Lookup Modal
const BulkLookupModal = ({ onClose, onSuccess, api }) => {
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
    setResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/admin/bulk-lookup', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
    } catch (err) {
      console.error('Bulk lookup error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to start lookup');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const itemCount = result.message.match(/\d+/)?.[0] || 'unknown';
    const estimatedMinutes = result.message.match(/approximately (\d+) minutes/)?.[1] || 'unknown';

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🔍 Bulk Lookup & Import</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="seed-success">
            <div className="success-icon">✅</div>
            <h3>Bulk Lookup Started!</h3>
            <p>{result.message}</p>
            
            <div className="info-box">
              <p><strong>📋 What happens next:</strong></p>
              <ul>
                <li>The system will process <strong>{itemCount} items</strong> from your file</li>
                <li>For each item, it will:
                  <ul>
                    <li>Search Wikipedia for the title</li>
                    <li>Fetch the page information (description, image, etc.)</li>
                    <li>Add the item to your database if found</li>
                  </ul>
                </li>
                <li>Items already in the database will be skipped</li>
                <li>Items not found on Wikipedia will be logged as errors</li>
              </ul>
            </div>
            
            <div className="warning-box">
              <p><strong>⏱️ Timing:</strong></p>
              <ul>
                <li>Estimated time: <strong>~{estimatedMinutes} minutes</strong> (approximately 0.3 seconds per item)</li>
                <li>The process respects Wikipedia's rate limits (300ms delays between requests)</li>
                <li>Progress is logged in Railway server logs</li>
                <li>Check the stats section after completion to see updated item counts</li>
              </ul>
            </div>
            
            <p className="info-text">
              💡 <strong>Tip:</strong> This is perfect for importing curated lists like "Top 100 Athletes" or "Best Movies of 2023". Just create a CSV with a "Title" column and optionally a "Category" column!
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
      <div className="modal-content bulk-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Bulk Lookup & Import</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bulk-import-info">
            <p>Upload a CSV or Excel file with a list of item titles. The system will automatically search Wikipedia for each item and add it to your database.</p>
            
            <div className="format-guide">
              <h4>📋 File Format Requirements</h4>
              <div className="format-table-wrapper">
                <table className="format-example">
                  <thead>
                    <tr>
                      <th className="required">Title <span className="required-badge">Required</span></th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>LeBron James</td>
                      <td>Sports</td>
                    </tr>
                    <tr>
                      <td>Michael Jordan</td>
                      <td>Sports</td>
                    </tr>
                    <tr>
                      <td>Tom Brady</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="format-notes">
                <p><strong>Column Details:</strong></p>
                <ul>
                  <li><code>Title</code> or <code>title</code> - <span className="required-text">Required</span> - The name of the item to search for on Wikipedia (e.g., "LeBron James", "The Matrix", "Pizza")</li>
                  <li><code>Category</code> or <code>category</code> - Optional - Category name (e.g., "Sports", "Movies & TV", "Food & Drinks"). If not found, the item will be added without a category.</li>
                </ul>
                <p className="format-tip">
                  💡 <strong>Tip:</strong> The system will:
                  <ul>
                    <li>Search Wikipedia for each title</li>
                    <li>Automatically fetch images and descriptions</li>
                    <li>Skip items that already exist in your database</li>
                    <li>Log errors for items not found on Wikipedia</li>
                  </ul>
                </p>
                <p className="format-tip">
                  ⚡ <strong>Example:</strong> Create a CSV like this:
                  <pre style={{ 
                    background: 'rgba(0, 0, 0, 0.3)', 
                    padding: '12px', 
                    borderRadius: '6px', 
                    marginTop: '10px', 
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontFamily: 'monospace',
                    overflow: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
{`Title,Category
LeBron James,Sports
Michael Jordan,Sports
Serena Williams,Sports
The Matrix,Movies & TV
Inception,Movies & TV`}
                  </pre>
                </p>
              </div>
            </div>
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
              {loading ? 'Starting...' : 'Start Lookup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Seed Top 2000 Modal
const SeedTop2000Modal = ({ onClose, onSuccess, api }) => {
  const [count, setCount] = useState('2000');
  const [category, setCategory] = useState('');
  const [startRank, setStartRank] = useState('');
  const [endRank, setEndRank] = useState('');
  const [useRange, setUseRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    
    const body = {};
    
    // Validate range if using range mode
    if (useRange) {
      const parsedStart = parseInt(startRank);
      const parsedEnd = parseInt(endRank);
      
      if (!startRank || !endRank || isNaN(parsedStart) || isNaN(parsedEnd)) {
        setError('Please enter valid start and end ranks');
        return;
      }
      
      if (parsedStart < 1) {
        setError('Start rank must be >= 1');
        return;
      }
      
      if (parsedEnd < parsedStart) {
        setError('End rank must be >= start rank');
        return;
      }
      
      body.startRank = parsedStart;
      body.endRank = parsedEnd;
    } else {
      // Validate count
      const parsedCount = parseInt(count);
      if (!count || isNaN(parsedCount) || parsedCount <= 0) {
        setError('Please enter a valid number greater than 0');
        return;
      }
      if (parsedCount > 10000) {
        setError('Count cannot exceed 10,000 (to respect API limits)');
        return;
      }
      
      body.count = parsedCount;
    }
    
    // Add category if specified
    if (category && category.trim()) {
      body.category = category.trim();
    }
    
    setLoading(true);

    try {
      await api.post('/api/admin/seed-top2000', body);

      setSuccess(true);
    } catch (err) {
      console.error('Seed top 2000 error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to start seeding');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🌱 Seed Top 2000 Articles</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="seed-success">
            <div className="success-icon">✅</div>
            <h3>Seeding Started!</h3>
            <p>The top 2000 articles seeding process has been started in the background.</p>
            
            <div className="info-box">
              <p><strong>📋 What happens next:</strong></p>
              <ul>
                <li>The system will gather articles from multiple high-quality sources:
                  <ul>
                    <li>Most viewed Wikipedia articles</li>
                    <li>Featured articles</li>
                    <li>Good articles</li>
                    <li>Popular categories (Countries, Cities, Biography, Films, etc.)</li>
                  </ul>
                </li>
                <li>Articles will be sorted by actual pageviews (using Wikipedia's REST API)</li>
                <li>Top {count} most popular articles will be added to your database</li>
              </ul>
            </div>
            
            <div className="warning-box">
              <p><strong>⏱️ Timing:</strong></p>
              <ul>
                <li>Estimated time: <strong>{Math.round(parseInt(count || 2000) / 120)}-{Math.round(parseInt(count || 2000) / 80)} minutes</strong> (approximately 1 minute per 100 articles)</li>
                <li>The process respects Wikipedia's rate limits (300ms delays)</li>
                <li>Progress is logged in Railway server logs</li>
                <li>Check the stats section after completion to see updated item counts</li>
              </ul>
            </div>
            
            <p className="info-text">
              💡 <strong>Tip:</strong> You can monitor progress by checking Railway logs. The process will continue even if you close this modal.
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
          <h2>🌱 Seed Top 2000 Articles</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="seed-top2000-info">
            <p>Seed your database with <strong>popular Wikipedia articles</strong> based on actual pageviews.</p>
            
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useRange}
                  onChange={(e) => setUseRange(e.target.checked)}
                  disabled={loading}
                />
                <span>Use rank range (e.g., 2000-3000) instead of top N</span>
              </label>
              <small className="field-hint">
                {useRange 
                  ? 'Select articles by their rank position (useful for avoiding duplicates)'
                  : 'Select top N most popular articles'}
              </small>
            </div>
            
            {useRange ? (
              <>
                <div className="form-group">
                  <label>
                    Start Rank *
                    <span className="field-hint"> - Starting position (1-based)</span>
                  </label>
                  <input
                    type="number"
                    value={startRank}
                    onChange={(e) => setStartRank(e.target.value)}
                    placeholder="2000"
                    min="1"
                    required
                    disabled={loading}
                  />
                  <small className="field-hint">
                    First rank position to include (e.g., 2000 means the 2000th most viewed article)
                  </small>
                </div>
                
                <div className="form-group">
                  <label>
                    End Rank *
                    <span className="field-hint"> - Ending position (inclusive)</span>
                  </label>
                  <input
                    type="number"
                    value={endRank}
                    onChange={(e) => setEndRank(e.target.value)}
                    placeholder="3000"
                    min="1"
                    required
                    disabled={loading}
                  />
                  <small className="field-hint">
                    Last rank position to include (e.g., 3000 means up to and including the 3000th article)
                  </small>
                </div>
              </>
            ) : (
              <div className="form-group">
                <label>
                  Number of Articles *
                  <span className="field-hint"> - How many top articles to add</span>
                </label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder="2000"
                  min="1"
                  max="10000"
                  required
                  disabled={loading}
                />
                <small className="field-hint">
                  Recommended: 2000 for a comprehensive start. You can trigger this multiple times to add more articles over time.
                </small>
              </div>
            )}
            
            <div className="form-group">
              <label>
                Category (Optional)
                <span className="field-hint"> - Filter by Wikipedia category</span>
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Films, Video games, Countries, or Category:Films"
                disabled={loading}
              />
              <small className="field-hint">
                Enter a Wikipedia category name (e.g., "Films" or "Category:Films"). Leave empty to gather from all sources.
              </small>
            </div>
            
            <div className="info-box">
              <p><strong>How it works:</strong></p>
              <ul>
                <li>Gathers articles from multiple high-quality sources:
                  <ul>
                    <li>Most viewed articles</li>
                    <li>Featured articles</li>
                    <li>Good articles</li>
                    <li>Popular categories (Countries, Cities, Biography, Films, Music, Video games, Sports, Technology)</li>
                  </ul>
                </li>
                <li>Uses Wikipedia's Pageviews REST API to sort by actual popularity</li>
                <li>Selects the top {count || 'N'} most viewed articles</li>
                <li>Fetches images and descriptions for each article</li>
                <li>Respects Wikipedia's rate limits (300ms delays between requests)</li>
              </ul>
            </div>
            
            <div className="info-box" style={{ background: 'rgba(79, 172, 254, 0.15)', borderLeft: '4px solid #4facfe' }}>
              <p><strong>💡 Continuous Growth:</strong></p>
              <p style={{ margin: '8px 0', fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)' }}>
                Your database already grows automatically! The system adds ~5 new articles every 30 minutes when above the threshold (50 items). 
                This seeding tool is for <strong>bulk initial seeding</strong> or when you want to add a large batch of popular articles quickly.
              </p>
            </div>
            
            <div className="warning-box">
              <p><strong>⚠️ Important:</strong></p>
              <ul>
                <li>This process takes approximately <strong>{Math.round(parseInt(count || 2000) / 120)}-{Math.round(parseInt(count || 2000) / 80)} minutes</strong> (1 min per ~100 articles)</li>
                <li>It runs in the background - you can close this modal</li>
                <li>Progress is logged in Railway server logs</li>
                <li>Existing items won't be duplicated</li>
                <li>You can trigger this multiple times to gradually build up your database</li>
              </ul>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Starting...' : 'Start Seeding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Seed Popular Culture Modal
const SeedPopularCultureModal = ({ onClose, onSuccess, api }) => {
  const [count, setCount] = useState('500');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    
    const parsedCount = parseInt(count);
    if (!count || isNaN(parsedCount) || parsedCount <= 0) {
      setError('Please enter a valid number greater than 0');
      return;
    }
    if (parsedCount > 5000) {
      setError('Count cannot exceed 5,000 (to respect API limits)');
      return;
    }
    
    setLoading(true);

    try {
      await api.post('/api/admin/seed-popular-culture', { count: parsedCount });

      setSuccess(true);
    } catch (err) {
      console.error('Seed popular culture error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to start seeding');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🎬 Seed Popular Culture</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="seed-success">
            <div className="success-icon">✅</div>
            <h3>Popular Culture Seeding Started!</h3>
            <p>The popular culture seeding process has been started in the background.</p>
            
            <div className="info-box">
              <p><strong>📋 What happens next:</strong></p>
              <ul>
                <li>The system will gather articles from <strong>recognizable categories</strong>:
                  <ul>
                    <li>TV Shows (American, British, Animated, Reality, Streaming)</li>
                    <li>Movies (American, British, Superhero, Animated, Action, Comedy, Horror)</li>
                    <li>Celebrities (Actors, Musicians, Singers, Rappers, Wrestlers, Models)</li>
                    <li>Sports (NBA, NFL, MLB, Premier League, Olympics, Formula One)</li>
                    <li>Music (Popular bands and artists)</li>
                    <li>Video Games (Popular franchises like Mario, Zelda, Pokémon)</li>
                    <li>Brands (Fast food, Tech companies, Cars, Sodas, Candy)</li>
                    <li>Internet & Memes (Popular websites, streaming services)</li>
                    <li>Food & Restaurants (Popular chains)</li>
                  </ul>
                </li>
                <li>Articles will be sorted by actual pageviews to prioritize familiar items</li>
                <li>Items with very low pageviews (obscure items) will be filtered out</li>
                <li>Top {count} most popular and recognizable articles will be added</li>
              </ul>
            </div>
            
            <div className="warning-box">
              <p><strong>⏱️ Timing:</strong></p>
              <ul>
                <li>Estimated time: <strong>{Math.round(parseInt(count || 500) / 80)}-{Math.round(parseInt(count || 500) / 60)} minutes</strong></li>
                <li>The process respects Wikipedia's rate limits (300ms delays)</li>
                <li>Progress is logged in Railway server logs</li>
                <li>Check the stats section after completion to see updated item counts</li>
              </ul>
            </div>
            
            <p className="info-text">
              💡 <strong>Tip:</strong> This seeding focuses on <strong>familiar, recognizable items</strong> that users will know and enjoy ranking. Use this to fill gaps in popular culture content!
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
          <h2>🎬 Seed Popular Culture</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="seed-top2000-info">
            <p>Seed your database with <strong>familiar, recognizable items</strong> from popular culture categories.</p>
            
            <div className="form-group">
              <label>
                Number of Articles *
                <span className="field-hint"> - How many popular culture items to add</span>
              </label>
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="500"
                min="1"
                max="5000"
                required
                disabled={loading}
              />
              <small className="field-hint">
                Recommended: 500-1000 for a good mix of familiar items. These will be from recognizable categories like TV shows, movies, celebrities, sports, brands, etc.
              </small>
            </div>
            
            <div className="info-box">
              <p><strong>What this does differently:</strong></p>
              <ul>
                <li>Focuses on <strong>specific, popular subcategories</strong> instead of broad categories
                  <ul>
                    <li>American/British TV shows & films (not just any TV/films)</li>
                    <li>NBA/NFL/MLB players (not random sports seasons)</li>
                    <li>Popular actors, musicians, celebrities (not obscure historical figures)</li>
                    <li>Well-known brands and chains (not random companies)</li>
                  </ul>
                </li>
                <li>Filters out obscure items with very low pageviews</li>
                <li>Prioritizes items users will recognize and enjoy comparing</li>
                <li>Fills gaps in popular culture content (sports, celebrities, TV, movies, etc.)</li>
              </ul>
            </div>
            
            <div className="warning-box">
              <p><strong>⚠️ Important:</strong></p>
              <ul>
                <li>This process takes approximately <strong>{Math.round(parseInt(count || 500) / 80)}-{Math.round(parseInt(count || 500) / 60)} minutes</strong></li>
                <li>It runs in the background - you can close this modal</li>
                <li>Progress is logged in Railway server logs</li>
                <li>Existing items won't be duplicated</li>
                <li>Use this to fill gaps in familiar content that users will recognize</li>
              </ul>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Starting...' : 'Start Seeding'}
            </button>
          </div>
        </form>
      </div>
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

