import React, { useState } from 'react';
import AuthModal from './AuthModal';
import './AccountPrompt.css';

const AccountPrompt = ({ onClose, onRegister, comparisonCount }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleCreateAccount = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    if (onRegister) {
      onRegister();
    }
    setShowAuthModal(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className="prompt-overlay" onClick={onClose}>
        <div className="prompt-content" onClick={(e) => e.stopPropagation()}>
          <div className="prompt-header">
            <div className="prompt-icon">🎉</div>
            <h2>You've Ranked {comparisonCount} Things!</h2>
            <p>Create a free account to track your progress and see your stats!</p>
          </div>

          <div className="prompt-benefits">
            <div className="benefit-item">
              <span className="benefit-icon">📊</span>
              <div>
                <strong>Track Your Stats</strong>
                <p>See all your comparisons in one place</p>
              </div>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">🏆</span>
              <div>
                <strong>Leaderboard</strong>
                <p>Compete with other users</p>
              </div>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">✨</span>
              <div>
                <strong>Sync Across Devices</strong>
                <p>Access your account from anywhere</p>
              </div>
            </div>
          </div>

          <div className="prompt-actions">
            <button className="prompt-button primary" onClick={handleCreateAccount}>
              Create Free Account
            </button>
            <button className="prompt-button secondary" onClick={onClose}>
              Maybe Later
            </button>
          </div>

          <div className="prompt-note">
            ✨ Your {comparisonCount} previous comparisons will be linked to your account!
          </div>
        </div>
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          initialMode="register"
          sessionId={localStorage.getItem('userSessionId')}
        />
      )}
    </>
  );
};

export default AccountPrompt;

