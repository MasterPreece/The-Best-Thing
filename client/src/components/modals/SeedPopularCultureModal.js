import React, { useState } from 'react';

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

export default SeedPopularCultureModal;

