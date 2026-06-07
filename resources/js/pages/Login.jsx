import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login({ onLogin }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setErrorMsg('');

        axios.post('/api/admin/login', { email, password })
            .then(res => {
                onLogin();
                navigate('/admin');
            })
            .catch(err => {
                console.error("Login failed:", err);
                if (err.response && err.response.data && err.response.data.message) {
                    setErrorMsg(err.response.data.message);
                } else if (err.response && err.response.data && err.response.data.errors) {
                    setErrorMsg(Object.values(err.response.data.errors)[0][0]);
                } else {
                    setErrorMsg("Invalid email or password. Please try again.");
                }
            })
            .finally(() => setLoading(false));
    };

    return (
        <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
            <div className="auth-box glass-panel">
                <h1 className="auth-title">Admin Access</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '2rem' }}>
                    Sign in to manage videos, reels, ads, and settings.
                </p>

                {errorMsg && (
                    <div className="notice-banner" style={{ background: 'rgba(220, 53, 69, 0.1)', borderColor: 'rgba(220, 53, 69, 0.3)', color: '#ff8080' }}>
                        ⚠️ {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input 
                            type="email" 
                            className="form-control"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@platform.com"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label className="form-label">Password</label>
                        <input 
                            type="password" 
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={loading}
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn-submit" 
                        style={{ width: '100%', padding: '12px' }}
                        disabled={loading}
                    >
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </main>
    );
}
