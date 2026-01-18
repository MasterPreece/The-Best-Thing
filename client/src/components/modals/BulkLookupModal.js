import React, { useState, useEffect } from 'react';

const BulkLookupModal = ({ onClose, onSuccess, api, initialCsvData }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // If initial CSV data is provided, convert it to a File
  useEffect(() => {
    if (initialCsvData && !file) {
      const blob = new Blob([initialCsvData], { type: 'text/csv' });
      const csvFile = new File([blob], `llm-query-${Date.now()}.csv`, { type: 'text/csv' });
      setFile(csvFile);
    }
  }, [initialCsvData]);

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
            {initialCsvData && (
              <div style={{ 
                background: 'rgba(102, 126, 234, 0.2)', 
                border: '1px solid rgba(102, 126, 234, 0.5)', 
                borderRadius: '6px', 
                padding: '10px', 
                marginBottom: '10px',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                ✅ File pre-filled from LLM Query tool
              </div>
            )}
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

export default BulkLookupModal;

