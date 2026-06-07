import React, { lazy, Suspense, useState, useEffect, useCallback, useRef, memo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import AdRenderer from './components/AdRenderer';
import { UploadProvider } from './components/UploadContext';
import UploadDashboard from './components/UploadDashboard';

// Configure Axios defaults
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.withCredentials = true;

// Lazy load pages — code-split per route
const Home          = lazy(() => import('./pages/Home'));
const VideoDetail   = lazy(() => import('./pages/VideoDetail'));
const Reels         = lazy(() => import('./pages/Reels'));
const Login         = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

/* ─────────────────────────────────────────────────────────
   Shared hook — one resize listener for the whole app
   instead of one per component that needs isMobile
───────────────────────────────────────────────────────── */
function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
    useEffect(() => {
        let rafId = null;
        const handleResize = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                setIsMobile(window.innerWidth <= breakpoint);
            });
        };
        window.addEventListener('resize', handleResize, { passive: true });
        return () => {
            window.removeEventListener('resize', handleResize);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [breakpoint]);
    return isMobile;
}

/* ─────────────────────────────────────────────────────────
   Header — memo prevents re-render unless isAdmin changes
───────────────────────────────────────────────────────── */
const Header = memo(function Header({ isAdmin, onLogout }) {
    const location = useLocation();
    const isMobile = useIsMobile();

    if (location.pathname === '/reels') return null;
    if (isMobile && location.pathname.startsWith('/video/')) return null;

    return (
        <header className="app-header">
            <Link to="/" className="nav-logo">
                <span>⚡</span> FREEHUB LIVE
            </Link>
            <nav className="nav-links desktop-nav">
                <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                    <span className="nav-text">Home</span>
                </Link>
                <Link to="/reels" className={`nav-link ${location.pathname === '/reels' ? 'active' : ''}`}>
                    <span className="nav-text">Reels</span>
                </Link>
                {isAdmin ? (
                    <>
                        <Link to="/admin" className="nav-link btn-admin">
                            <span className="nav-text">Admin Portal</span>
                        </Link>
                        <button onClick={onLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <span className="nav-text">Logout</span>
                        </button>
                    </>
                ) : (
                    <Link to="/admin/login" className="nav-link btn-admin">
                        <span className="nav-text">Admin</span>
                    </Link>
                )}
            </nav>
        </header>
    );
});

/* ─────────────────────────────────────────────────────────
   Mobile Bottom Nav — memo + shared useIsMobile hook
───────────────────────────────────────────────────────── */
const MobileBottomNav = memo(function MobileBottomNav({ isAdmin, onLogout }) {
    const location = useLocation();
    const isMobile = useIsMobile();

    if (!isMobile) return null;

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <nav className="mobile-bottom-nav" id="mobile-bottom-nav">
            <Link to="/" className={`mobile-nav-item ${isActive('/') ? 'active' : ''}`}>
                <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span className="mobile-nav-label">Home</span>
            </Link>
            <Link to="/reels" className={`mobile-nav-item ${isActive('/reels') ? 'active' : ''}`}>
                <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                </svg>
                <span className="mobile-nav-label">Reels</span>
            </Link>
            {isAdmin ? (
                <Link to="/admin" className={`mobile-nav-item ${isActive('/admin') ? 'active' : ''}`}>
                    <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span className="mobile-nav-label">Admin</span>
                </Link>
            ) : (
                <Link to="/admin/login" className={`mobile-nav-item ${isActive('/admin') ? 'active' : ''}`}>
                    <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span className="mobile-nav-label">Login</span>
                </Link>
            )}
            {isAdmin && (
                <button onClick={onLogout} className="mobile-nav-item">
                    <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span className="mobile-nav-label">Logout</span>
                </button>
            )}
        </nav>
    );
});

/* ─────────────────────────────────────────────────────────
   Footer — debounced ad fetch to prevent stacking requests
   on rapid navigation
───────────────────────────────────────────────────────── */
const Footer = memo(function Footer() {
    const location  = useLocation();
    const [ad, setAd] = useState(null);
    const timerRef  = useRef(null);
    const impressionLoggedRef = useRef(null);

    useEffect(() => {
        if (location.pathname === '/reels') {
            setAd(null);
            return;
        }
        // Debounce: wait 150ms before fetching to avoid rapid navigation stacking
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const device = window.innerWidth <= 768 ? 'mobile' : 'desktop';
            axios.get(`/api/ads/footer?device=${device}`)
                .then(res => setAd(res.data.ad ?? null))
                .catch(() => {});
        }, 150);

        return () => clearTimeout(timerRef.current);
    }, [location.pathname]);

    // Log impression only once per unique ad
    useEffect(() => {
        if (ad && ad.id !== impressionLoggedRef.current) {
            impressionLoggedRef.current = ad.id;
            axios.post(`/api/ads/${ad.id}/impression`).catch(() => {});
        }
    }, [ad]);

    if (location.pathname === '/reels') return null;

    const handleAdClick = useCallback(() => {
        if (!ad) return;
        axios.post(`/api/ads/${ad.id}/click`).catch(() => {});
        if (ad.redirect_url) {
            window.open(ad.redirect_url, '_blank', 'noopener,noreferrer');
        }
    }, [ad]);

    return (
        <div>
            {ad && (
                <div className="ad-banner" style={{ margin: '2rem auto', maxWidth: '1400px', padding: '0 2rem' }}>
                    {ad.image_path ? (
                        <a
                            href={ad.redirect_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { e.preventDefault(); handleAdClick(); }}
                            style={{ display: 'block', width: '100%', textAlign: 'center' }}
                        >
                            {ad.media_type === 'video' ? (
                                <video src={ad.image_path} autoPlay muted loop playsInline
                                    style={{ maxWidth: '100%', borderRadius: '12px', display: 'inline-block' }} />
                            ) : (
                                <img src={ad.image_path} alt={ad.title} loading="lazy"
                                    style={{ maxWidth: '100%', borderRadius: '12px', display: 'inline-block' }} />
                            )}
                        </a>
                    ) : (
                        <AdRenderer adCode={ad.ad_code} />
                    )}
                </div>
            )}
            <footer style={{
                padding: '2rem',
                textAlign: 'center',
                borderTop: '1px solid var(--border-glass)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                marginTop: '3rem'
            }}>
                <p>&copy; {new Date().getFullYear()} FreeHub Live. All rights reserved.</p>
            </footer>
        </div>
    );
});

/* ─────────────────────────────────────────────────────────
   ScrollToTop — restores position on route change
───────────────────────────────────────────────────────── */
const ScrollToTop = memo(function ScrollToTop() {
    const location = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);
    return null;
});

/* ─────────────────────────────────────────────────────────
   App root
───────────────────────────────────────────────────────── */
function App() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get('/api/admin/status')
            .then(res => { if (res.data.authenticated) setIsAdmin(true); })
            .catch(() => setIsAdmin(false))
            .finally(() => setLoading(false));
    }, []);

    // Stable reference — won't trigger child re-renders
    const handleLogout = useCallback(() => {
        axios.post('/api/admin/logout').then(() => {
            setIsAdmin(false);
            window.location.href = '/';
        });
    }, []);

    const handleLogin = useCallback(() => setIsAdmin(true), []);

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <UploadProvider>
            <Router>
                <ScrollToTop />
                <div className="app-container">
                    <Header isAdmin={isAdmin} onLogout={handleLogout} />
                    <div style={{ flex: 1 }}>
                        <Suspense fallback={
                            <div style={{ display: 'flex', height: '80vh', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="spinner"></div>
                            </div>
                        }>
                            <Routes>
                                <Route path="/"               element={<Home />} />
                                <Route path="/video/:id"      element={<VideoDetail />} />
                                <Route path="/reels"          element={<Reels />} />
                                <Route path="/admin/login"    element={<Login onLogin={handleLogin} />} />
                                <Route path="/admin/*"        element={<AdminDashboard isAdmin={isAdmin} />} />
                            </Routes>
                        </Suspense>
                    </div>
                    <Footer />
                    <MobileBottomNav isAdmin={isAdmin} onLogout={handleLogout} />
                    {isAdmin && <UploadDashboard />}
                </div>
            </Router>
        </UploadProvider>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
