import React, { useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import AdminVideos from './AdminVideos';
import AdminReels from './AdminReels';
import AdminAds from './AdminAds';
import AdminSettings from './AdminSettings';
import AdminCodeManager from './AdminCodeManager';

export default function AdminDashboard({ isAdmin }) {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Guard route
        if (!isAdmin) {
            navigate('/admin/login');
        }
    }, [isAdmin, navigate]);

    if (!isAdmin) return null;

    return (
        <main className="main-content">
            <div className="admin-layout">
                {/* Admin Navigation Sidebar */}
                <div className="admin-sidebar glass-panel">
                    <h3 style={{ fontSize: '1rem', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5rem', color: 'var(--secondary)' }}>
                        Control Panel
                    </h3>
                    <Link 
                        to="/admin/videos" 
                        className={`admin-sidebar-link ${location.pathname.startsWith('/admin/videos') || location.pathname === '/admin' ? 'active' : ''}`}
                    >
                        🎥 Videos
                    </Link>
                    <Link 
                        to="/admin/reels" 
                        className={`admin-sidebar-link ${location.pathname.startsWith('/admin/reels') ? 'active' : ''}`}
                    >
                        🔥 Reels
                    </Link>
                    <Link 
                        to="/admin/ads" 
                        className={`admin-sidebar-link ${location.pathname.startsWith('/admin/ads') ? 'active' : ''}`}
                    >
                        📣 Advertisements
                    </Link>
                    <Link 
                        to="/admin/settings" 
                        className={`admin-sidebar-link ${location.pathname.startsWith('/admin/settings') ? 'active' : ''}`}
                    >
                        ⚙️ System Settings
                    </Link>
                    <Link 
                        to="/admin/code-manager" 
                        className={`admin-sidebar-link ${location.pathname.startsWith('/admin/code-manager') ? 'active' : ''}`}
                    >
                        💻 Custom Code Manager
                    </Link>
                </div>

                {/* Sub Panel Dynamic Routing */}
                <div className="glass-panel admin-content-panel">
                    <Routes>
                        <Route path="/" element={<AdminVideos />} />
                        <Route path="/videos" element={<AdminVideos />} />
                        <Route path="/reels" element={<AdminReels />} />
                        <Route path="/ads" element={<AdminAds />} />
                        <Route path="/settings" element={<AdminSettings />} />
                        <Route path="/code-manager" element={<AdminCodeManager />} />
                    </Routes>
                </div>
            </div>
        </main>
    );
}
