import React, { useState } from 'react';

const LLMQueryModal = ({ onClose, onSuccess, api }) => {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(100);
  const [countInput, setCountInput] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [csvData, setCsvData] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setError('');
    setResult(null);
    setCsvData('');
    setLoading(true);

    try {
      const itemCount = typeof count === 'number' && count >= 1 && count <= 500 
        ? count 
        : (parseInt(count) || 100);
      
      const response = await api.post('/api/admin/llm-query', {
        query: query.trim(),
        count: Math.min(Math.max(itemCount, 1), 500) // Ensure between 1-500
      });

      setResult(response.data);
      setCsvData(response.data.csv);
    } catch (err) {
      console.error('LLM Query error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to generate list');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCSV = () => {
    if (csvData) {
      navigator.clipboard.writeText(csvData);
      alert('CSV copied to clipboard!');
    }
  };

  const handleDownloadCSV = () => {
    if (csvData) {
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `llm-query-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleUseInBulkLookup = () => {
    if (!csvData) return;
    
    // Convert CSV to a File object
    const blob = new Blob([csvData], { type: 'text/csv' });
    const file = new File([blob], `llm-query-${Date.now()}.csv`, { type: 'text/csv' });
    
    // Trigger bulk lookup with this file
    if (onSuccess) {
      onSuccess(file, csvData);
    }
    onClose();
  };

  if (result) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content bulk-import-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
          <div className="modal-header">
            <h2>🤖 LLM Query Results</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="seed-success">
            <div className="success-icon">✅</div>
            <h3>Generated {result.count} Items</h3>
            <p><strong>Query:</strong> "{result.query}"</p>
            
            <div className="info-box">
              <p><strong>📋 Generated CSV:</strong></p>
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.4)', 
                padding: '15px', 
                borderRadius: '8px', 
                marginTop: '10px',
                maxHeight: '300px',
                overflow: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                {csvData.substring(0, 1000)}{csvData.length > 1000 ? '...' : ''}
              </div>
              
              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={handleCopyCSV} className="save-button" style={{ flex: '1 1 auto' }}>
                  📋 Copy CSV
                </button>
                <button onClick={handleDownloadCSV} className="save-button" style={{ flex: '1 1 auto' }}>
                  💾 Download CSV
                </button>
                <button onClick={handleUseInBulkLookup} className="save-button bulk-lookup-button" style={{ flex: '1 1 auto' }}>
                  🔍 Use in Bulk Lookup
                </button>
              </div>
            </div>
            
            <p className="info-text">
              💡 <strong>Tip:</strong> You can copy the CSV, download it, or directly use it with the Bulk Lookup tool to add all items to your database!
            </p>
            
            <div className="modal-actions">
              <button onClick={() => { setResult(null); setCsvData(''); setQuery(''); }} className="cancel-button">
                New Query
              </button>
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
      <div className="modal-content bulk-import-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h2>🤖 LLM Query Tool</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bulk-import-info">
            <p>Use natural language to generate a list of items in CSV format. Perfect for queries like "top 100 NBA players" or "best movies of 2023".</p>
            
            <div className="format-guide">
              <h4>📋 How it works</h4>
              <ul>
                <li>Enter a natural language query describing the list you want</li>
                <li>The AI will generate a CSV-formatted list of items</li>
                <li>You can copy, download, or directly use the CSV with Bulk Lookup</li>
                <li>Each item will automatically be looked up on Wikipedia and added to your database</li>
              </ul>
              
              <h4 style={{ marginTop: '20px' }}>💡 Example Queries</h4>
              <ul>
                <li>"Top 100 players currently in the NBA"</li>
                <li>"Best movies of 2023"</li>
                <li>"Top 50 most popular video games"</li>
                <li>"100 famous scientists throughout history"</li>
                <li>"Top restaurants in New York City"</li>
              </ul>
            </div>
          </div>

          <div className="form-group">
            <label>Query</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Give me the top 100 players currently in the NBA"
              rows={3}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          <div className="form-group">
            <label>Number of Items</label>
            <input
              type="number"
              value={countInput}
              onChange={(e) => {
                const value = e.target.value;
                // Update input value to allow typing
                setCountInput(value);
                // Parse and validate the number
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                  if (numValue >= 1 && numValue <= 500) {
                    setCount(numValue);
                  } else if (numValue > 500) {
                    setCount(500);
                    setCountInput('500');
                  } else if (numValue < 1 && value !== '') {
                    setCount(1);
                    setCountInput('1');
                  }
                }
              }}
              onBlur={(e) => {
                // If empty or invalid on blur, reset to default
                const value = e.target.value;
                const numValue = parseInt(value, 10);
                if (!value || isNaN(numValue) || numValue < 1) {
                  setCount(100);
                  setCountInput('100');
                } else if (numValue > 500) {
                  setCount(500);
                  setCountInput('500');
                } else {
                  setCount(numValue);
                  setCountInput(String(numValue));
                }
              }}
              min={1}
              max={500}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '14px'
              }}
            />
            <small style={{ color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginTop: '5px' }}>
              Number of items to generate (1-500, default: 100)
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={loading || !query.trim()}>
              {loading ? 'Generating...' : '🤖 Generate List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LLMQueryModal;

