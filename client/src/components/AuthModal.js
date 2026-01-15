import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';
import './AuthModal.css';

const AuthModal = ({ onClose, onSuccess, initialMode = 'register', sessionId = null }) => {
  const [mode, setMode] = useState(initialMode); // 'register' or 'login'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const { login, register } = useAuth();

  const hideToast = () => setToast(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }

      const result = await register(email, username, password, sessionId);
      if (result.success) {
        setToast({ message: 'Account created successfully!', type: 'success' });
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onClose) onClose();
        }, 1000);
      } else {
        setError(result.error);
      }
    } else {
      const result = await login(email, password);
      if (result.success) {
        setToast({ message: 'Logged in successfully!', type: 'success' });
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onClose) onClose();
        }, 1000);
      } else {
        setError(result.error);
      }
    }

    setLoading(false);
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          
          <div className="modal-header">
            <h2>{mode === 'register' ? 'Create Account' : 'Login'}</h2>
            <p className="modal-subtitle">
              {mode === 'register' 
                ? 'Track your comparisons and see your stats!'
                : 'Welcome back!'
              }
            </p>
          </div>

          {error && (
            <div className="modal-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="yourusername"
                  pattern="[a-zA-Z0-9_]{3,20}"
                  title="3-20 characters, letters, numbers, or underscore only"
                />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm your password"
                />
              </div>
            )}

            <button type="submit" className="auth-submit-button" disabled={loading}>
              {loading ? 'Loading...' : mode === 'register' ? 'Create Account' : 'Login'}
            </button>
          </form>

          <div className="modal-footer">
            {mode === 'register' ? (
              <p>
                Already have an account?{' '}
                <button className="link-button" onClick={() => setMode('login')}>
                  Login
                </button>
              </p>
            ) : (
              <p>
                Don't have an account?{' '}
                <button className="link-button" onClick={() => setMode('register')}>
                  Create one
                </button>
              </p>
            )}
          </div>

          {mode === 'register' && sessionId && (
            <div className="account-benefit">
              ✨ Your {sessionId ? 'previous' : ''} comparisons will be linked to your account!
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthModal;

