import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Comparison from './components/Comparison';
import Rankings from './components/Rankings';
import Leaderboard from './components/Leaderboard';
import ItemDetail from './components/ItemDetail';
import UserStats from './components/UserStats';
import AuthModal from './components/AuthModal';
import DonateModal from './components/DonateModal';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

function MoreMenu({ showAuthModal, setShowAuthModal, setShowDonateModal, user, logout, isAuthenticated }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Close on Escape key
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleMenuItemClick = () => {
    setIsOpen(false);
  };

  return (
    <div className="nav-more-menu" ref={menuRef}>
      <button 
        className="more-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="More menu"
        aria-expanded={isOpen}
      >
        <span className="more-menu-icon">⋯</span>
        <span className="more-menu-text">More</span>
      </button>
      
      {isOpen && (
        <div className="more-menu-dropdown">
          {isAuthenticated && (
            <>
              <div className="more-menu-user-info">
                <span className="more-menu-user-icon">👤</span>
                <span className="more-menu-username">{user?.username}</span>
              </div>
              <div className="more-menu-divider"></div>
              <Link 
                to="/stats" 
                className={`more-menu-item ${isActive('/stats') ? 'active' : ''}`}
                onClick={handleMenuItemClick}
              >
                <span className="more-menu-item-icon">📊</span>
                <span className="more-menu-item-text">My Stats</span>
              </Link>
              <div className="more-menu-divider"></div>
            </>
          )}
          <button 
            className="more-menu-item"
            onClick={() => {
              setShowDonateModal(true);
              handleMenuItemClick();
            }}
          >
            <span className="more-menu-item-icon">💝</span>
            <span className="more-menu-item-text">Donate</span>
          </button>
          {isAuthenticated ? (
            <button 
              className="more-menu-item more-menu-item-logout"
              onClick={() => {
                logout();
                handleMenuItemClick();
              }}
            >
              <span className="more-menu-item-icon">🚪</span>
              <span className="more-menu-item-text">Logout</span>
            </button>
          ) : (
            <button 
              className="more-menu-item"
              onClick={() => {
                setShowAuthModal(true);
                handleMenuItemClick();
              }}
            >
              <span className="more-menu-item-icon">🔐</span>
              <span className="more-menu-item-text">Login</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
      <MoreMenu 
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
        setShowDonateModal={setShowDonateModal}
        user={user}
        logout={logout}
        isAuthenticated={isAuthenticated}
      />
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
        <Route path="/stats" element={<UserStats />} />
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

