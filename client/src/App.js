import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Comparison from './components/Comparison';
import Rankings from './components/Rankings';
import Leaderboard from './components/Leaderboard';
import ItemDetail from './components/ItemDetail';
import AuthModal from './components/AuthModal';
import DonateModal from './components/DonateModal';
import './App.css';

function AppContent() {
  const [userSessionId, setUserSessionId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    // Generate or retrieve user session ID
    let sessionId = localStorage.getItem('userSessionId');
    if (!sessionId) {
      sessionId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('userSessionId', sessionId);
    }
    setUserSessionId(sessionId);
  }, []);

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
  };

  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-logo">
              🏆 The Best Thing
            </Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">Compare</Link>
              <Link to="/rankings" className="nav-link">Rankings</Link>
              <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
              <button className="nav-donate" onClick={() => setShowDonateModal(true)}>
                💝 Donate
              </button>
              {isAuthenticated ? (
                <>
                  <span className="nav-user">👤 {user?.username}</span>
                  <button className="nav-logout" onClick={logout}>Logout</button>
                </>
              ) : (
                <button className="nav-login" onClick={() => setShowAuthModal(true)}>Login</button>
              )}
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Comparison userSessionId={userSessionId} />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/items/:id" element={<ItemDetail />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>A fun meme website to find the best thing 🎉</p>
        </footer>

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={handleAuthSuccess}
            initialMode="login"
            sessionId={userSessionId}
          />
        )}

        {showDonateModal && (
          <DonateModal onClose={() => setShowDonateModal(false)} />
        )}
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

