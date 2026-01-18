import React, { useState } from 'react';

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

export default BulkImportModal;

