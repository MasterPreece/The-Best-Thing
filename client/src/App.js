import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Comparison from './components/Comparison';
import Rankings from './components/Rankings';
import Leaderboard from './components/Leaderboard';
import ItemDetail from './components/ItemDetail';
import AuthModal from './components/AuthModal';
import DonateModal from './components/DonateModal';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

function NavLinks({ showAuthModal, setShowAuthModal, setShowDonateModal, user, logout, isAuthenticated }) {
  const location = useLocation();
  
  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };
  
  return (
    <div className="nav-links">
      <Link 
        to="/" 
        className={`nav-link nav-link-primary ${isActive('/') ? 'active' : ''}`}
      >
        <span className="nav-link-icon">⚖️</span>
        <span className="nav-link-text">Compare</span>
      </Link>
      <Link 
        to="/rankings" 
        className={`nav-link nav-link-primary ${isActive('/rankings') ? 'active' : ''}`}
      >
        <span className="nav-link-icon">🏆</span>
        <span className="nav-link-text">Rankings</span>
      </Link>
      <Link 
        to="/leaderboard" 
        className={`nav-link nav-link-primary ${isActive('/leaderboard') ? 'active' : ''}`}
      >
        <span className="nav-link-icon">🏅</span>
        <span className="nav-link-text">Leaderboard</span>
      </Link>
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
  );
}

function AppRoutes({ userSessionId, adminToken, setAdminToken }) {
  const location = useLocation();
  
  return (
    <div className="page-transition-wrapper" key={location.pathname}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Comparison userSessionId={userSessionId} />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route 
          path="/admin" 
          element={
            adminToken ? (
              <AdminDashboard 
                adminToken={adminToken}
                onLogout={() => {
                  localStorage.removeItem('adminToken');
                  setAdminToken(null);
                }}
              />
            ) : (
              <AdminLogin 
                onLogin={(token) => {
                  localStorage.setItem('adminToken', token);
                  setAdminToken(token);
                }}
              />
            )
          } 
        />
      </Routes>
    </div>
  );
}

function AppContent() {
  const [userSessionId, setUserSessionId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [adminToken, setAdminToken] = useState(null);
  const { user, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    // Check for admin token in localStorage
    const token = localStorage.getItem('adminToken');
    if (token) {
      setAdminToken(token);
    }
  }, []);

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
            <NavLinks 
              showAuthModal={showAuthModal}
              setShowAuthModal={setShowAuthModal}
              setShowDonateModal={setShowDonateModal}
              user={user}
              logout={logout}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </nav>

        <main className="main-content">
          <AppRoutes 
            userSessionId={userSessionId} 
            adminToken={adminToken} 
            setAdminToken={setAdminToken} 
          />
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

