import React, { useState } from 'react';

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

export default SeedTop2000Modal;

