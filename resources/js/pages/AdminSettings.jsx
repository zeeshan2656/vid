import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminSettings() {
    const [siteName, setSiteName] = useState('');
    const [siteDescription, setSiteDescription] = useState('');
    const [logoText, setLogoText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        axios.get('/api/admin/settings')
            .then(res => {
                setSiteName(res.data.site_name || '');
                setSiteDescription(res.data.site_description || '');
                setLogoText(res.data.logo_text || '');
            })
            .catch(err => console.error("Error loading settings:", err))
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        setSaving(true);
        setStatusMsg('');

        axios.post('/api/admin/settings', {
            settings: {
                site_name: siteName,
                site_description: siteDescription,
                logo_text: logoText
            }
        })
        .then(res => {
            setStatusMsg('Settings saved successfully!');
            setTimeout(() => setStatusMsg(''), 3000);
        })
        .catch(err => {
            console.error("Error saving settings:", err);
            setStatusMsg('Failed to save settings. Please try again.');
        })
        .finally(() => setSaving(false));
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div>
            <h2 className="admin-panel-title">System Settings</h2>

            {statusMsg && (
                <div className="notice-banner" style={{ background: statusMsg.includes('failed') ? 'rgba(220, 53, 69, 0.1)' : 'rgba(0, 243, 255, 0.08)', borderColor: statusMsg.includes('failed') ? 'rgba(220, 53, 69, 0.3)' : 'rgba(0, 243, 255, 0.25)', color: statusMsg.includes('failed') ? '#ff8080' : '#e0faff' }}>
                    {statusMsg.includes('failed') ? '⚠️' : '✨'} {statusMsg}
                </div>
            )}

            <div className="glass-panel" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Platform Name (Site Title)</label>
                        <input 
                            type="text" 
                            className="form-control"
                            value={siteName}
                            onChange={(e) => setSiteName(e.target.value)}
                            placeholder="FreeHub Live"
                            required
                            disabled={saving}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Logo / Brand Text</label>
                        <input 
                            type="text" 
                            className="form-control"
                            value={logoText}
                            onChange={(e) => setLogoText(e.target.value)}
                            placeholder="FREEHUB"
                            required
                            disabled={saving}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label className="form-label">SEO Description (Meta Tag)</label>
                        <textarea 
                            className="form-control"
                            value={siteDescription}
                            onChange={(e) => setSiteDescription(e.target.value)}
                            placeholder="The fastest video sharing site on shared hosting..."
                            style={{ height: '80px', resize: 'vertical' }}
                            disabled={saving}
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn-submit"
                        disabled={saving}
                    >
                        {saving ? 'Saving System Settings...' : 'Save Settings'}
                    </button>
                </form>
            </div>
        </div>
    );
}
