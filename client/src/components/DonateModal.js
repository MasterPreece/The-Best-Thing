import React from 'react';
import './DonateModal.css';

const DonateModal = ({ onClose }) => {
  const paypalLink = 'https://www.paypal.com/ncp/payment/KAJAYC7K2KAAE';
  
  // For Venmo, you can also use a QR code link or direct payment link
  // Venmo format: https://venmo.com/yourusername or use their payment link feature

  return (
    <div className="donate-overlay" onClick={onClose}>
      <div className="donate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="donate-header">
          <h2>💝 Support The Best Thing</h2>
          <button className="donate-close" onClick={onClose}>×</button>
        </div>
        
        <div className="donate-content">
          <p className="donate-message">
            Help keep The Best Thing running! Your donations help cover hosting costs and keep the site free for everyone.
          </p>
          
          <div className="donate-options">
            <a
              href={paypalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="donate-button paypal"
            >
              <span className="donate-icon">💳</span>
              <span>Donate via PayPal</span>
            </a>
          </div>
          
          <p className="donate-note">
            All donations are anonymous and greatly appreciated! 🙏
          </p>
        </div>
      </div>
    </div>
  );
};

export default DonateModal;

