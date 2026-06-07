import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminCodeManager() {
    const [activeTab, setActiveTab] = useState('scripts'); // 'scripts' | 'analytics'
    
    // Code script values
    const [headCode, setHeadCode] = useState('');
    const [bodyStartCode, setBodyStartCode] = useState('');
    const [bodyEndCode, setBodyEndCode] = useState('');

    // Analytics IDs
    const [gaId, setGaId] = useState('');
    const [gtmId, setGtmId] = useState('');
    const [gscCode, setGscCode] = useState('');
    const [clarityId, setClarityId] = useState('');
    const [pixelId, setPixelId] = useState('');

    // Original values for reset action
    const [originalData, setOriginalData] = useState({});

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = () => {
        setLoading(true);
        axios.get('/api/admin/settings')
            .then(res => {
                const data = res.data || {};
                setHeadCode(data.custom_head_code || '');
                setBodyStartCode(data.custom_body_start_code || '');
                setBodyEndCode(data.custom_body_end_code || '');
                setGaId(data.google_analytics_id || '');
                setGtmId(data.google_tag_manager_id || '');
                setGscCode(data.google_search_console_code || '');
                setClarityId(data.microsoft_clarity_id || '');
                setPixelId(data.meta_pixel_id || '');

                setOriginalData(data);
            })
            .catch(err => console.error("Error loading code manager settings:", err))
            .finally(() => setLoading(false));
    };

    const handleReset = () => {
        if (window.confirm("Are you sure you want to discard your unsaved changes?")) {
            setHeadCode(originalData.custom_head_code || '');
            setBodyStartCode(originalData.custom_body_start_code || '');
            setBodyEndCode(originalData.custom_body_end_code || '');
            setGaId(originalData.google_analytics_id || '');
            setGtmId(originalData.google_tag_manager_id || '');
            setGscCode(originalData.google_search_console_code || '');
            setClarityId(originalData.microsoft_clarity_id || '');
            setPixelId(originalData.meta_pixel_id || '');
            
            setStatusMsg('Changes discarded successfully.');
            setTimeout(() => setStatusMsg(''), 3000);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setSaving(true);
        setStatusMsg('');

        axios.post('/api/admin/settings', {
            settings: {
                custom_head_code: headCode,
                custom_body_start_code: bodyStartCode,
                custom_body_end_code: bodyEndCode,
                google_analytics_id: gaId,
                google_tag_manager_id: gtmId,
                google_search_console_code: gscCode,
                microsoft_clarity_id: clarityId,
                meta_pixel_id: pixelId
            }
        })
        .then(res => {
            const data = res.data.settings || {};
            setOriginalData(data);
            setStatusMsg('Custom codes and tracking settings updated successfully!');
            setTimeout(() => setStatusMsg(''), 4000);
        })
        .catch(err => {
            console.error("Error saving code manager settings:", err);
            setStatusMsg('Failed to update tracking settings. Please try again.');
        })
        .finally(() => setSaving(false));
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div>
            <h2 className="admin-panel-title">Custom Code & Scripts Manager</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
                Inject tracking scripts, verification tags, custom CSS, analytics, or widgets globally without editing server files.
            </p>

            {statusMsg && (
                <div className="notice-banner" style={{ background: statusMsg.includes('Failed') ? 'rgba(220, 53, 69, 0.1)' : 'rgba(0, 243, 255, 0.08)', borderColor: statusMsg.includes('Failed') ? 'rgba(220, 53, 69, 0.3)' : 'rgba(0, 243, 255, 0.25)', color: statusMsg.includes('Failed') ? '#ff8080' : '#e0faff' }}>
                    {statusMsg.includes('Failed') ? '⚠️' : '✨'} {statusMsg}
                </div>
            )}

            {/* Tab switch bar */}
            <div className="admin-tab-bar" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                <button 
                    onClick={() => setActiveTab('scripts')}
                    style={{
                        padding: '10px 20px',
                        background: activeTab === 'scripts' ? 'rgba(0, 243, 255, 0.08)' : 'transparent',
                        border: '1px solid ' + (activeTab === 'scripts' ? 'var(--secondary)' : 'transparent'),
                        color: activeTab === 'scripts' ? 'var(--text-white)' : 'var(--text-muted)',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease',
                    }}
                >
                    📝 Custom Code Injection
                </button>
                <button 
                    onClick={() => setActiveTab('analytics')}
                    style={{
                        padding: '10px 20px',
                        background: activeTab === 'analytics' ? 'rgba(0, 243, 255, 0.08)' : 'transparent',
                        border: '1px solid ' + (activeTab === 'analytics' ? 'var(--secondary)' : 'transparent'),
                        color: activeTab === 'analytics' ? 'var(--text-white)' : 'var(--text-muted)',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease',
                    }}
                >
                    📈 Analytics & Verification IDs
                </button>
            </div>

            <div className="glass-panel" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>
                    
                    {/* Tab 1: Scripts */}
                    {activeTab === 'scripts' && (
                        <div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Head Section Scripts</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Injected before &lt;/head&gt;</span>
                                </label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 8px 0' }}>
                                    Ideal for custom styles (&lt;style&gt;), verification meta tags, or async initialization scripts.
                                </p>
                                <textarea 
                                    className="form-control"
                                    value={headCode}
                                    onChange={(e) => setHeadCode(e.target.value)}
                                    placeholder="<!-- Paste your code here. Example: <script async src='...'></script> -->"
                                    style={{
                                        height: '180px',
                                        fontFamily: 'monospace, Consolas, Courier New',
                                        fontSize: '0.85rem',
                                        background: '#040409',
                                        color: '#39ff14', // Neon terminal green for cool factor
                                        border: '1px solid var(--border-glass)',
                                        resize: 'vertical',
                                    }}
                                    disabled={saving}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Body Start Scripts</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Injected immediately after &lt;body&gt;</span>
                                </label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 8px 0' }}>
                                    Required for Google Tag Manager noscript code or tracking pixels.
                                </p>
                                <textarea 
                                    className="form-control"
                                    value={bodyStartCode}
                                    onChange={(e) => setBodyStartCode(e.target.value)}
                                    placeholder="<!-- Paste your code here. Example: <noscript>...</noscript> -->"
                                    style={{
                                        height: '140px',
                                        fontFamily: 'monospace, Consolas, Courier New',
                                        fontSize: '0.85rem',
                                        background: '#040409',
                                        color: '#00f3ff', // Cyan
                                        border: '1px solid var(--border-glass)',
                                        resize: 'vertical',
                                    }}
                                    disabled={saving}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Body End Scripts</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Injected before &lt;/body&gt;</span>
                                </label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 8px 0' }}>
                                    Best location for support chat widgets, helper libraries, or ad scripts that run after visual load.
                                </p>
                                <textarea 
                                    className="form-control"
                                    value={bodyEndCode}
                                    onChange={(e) => setBodyEndCode(e.target.value)}
                                    placeholder="<!-- Paste your code here. Example: <script>initializeWidget();</script> -->"
                                    style={{
                                        height: '180px',
                                        fontFamily: 'monospace, Consolas, Courier New',
                                        fontSize: '0.85rem',
                                        background: '#040409',
                                        color: '#ff00ff', // Pink
                                        border: '1px solid var(--border-glass)',
                                        resize: 'vertical',
                                    }}
                                    disabled={saving}
                                />
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Analytics IDs */}
                    {activeTab === 'analytics' && (
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid var(--secondary)' }}>
                                💡 Entering values below will generate and inject scripts automatically. You do not need to paste script wrappers when utilizing these quick-access fields.
                            </p>

                            <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                                <label className="form-label">Google Analytics Measurement ID</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={gaId}
                                    onChange={(e) => setGaId(e.target.value)}
                                    placeholder="G-XXXXXXXXXX"
                                    disabled={saving}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Required for Google Analytics 4 tracking.</span>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                                <label className="form-label">Google Tag Manager Container ID</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={gtmId}
                                    onChange={(e) => setGtmId(e.target.value)}
                                    placeholder="GTM-XXXXXXX"
                                    disabled={saving}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Injects GTM script in the head and noscript iframe in the body automatically.</span>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                                <label className="form-label">Google Search Console Verification Tag / Code</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={gscCode}
                                    onChange={(e) => setGscCode(e.target.value)}
                                    placeholder="Google Verification Tag (or paste full HTML meta tag)"
                                    disabled={saving}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Accepts either the raw code string or the full HTML verification tag.</span>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                                <label className="form-label">Microsoft Clarity Project ID</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={clarityId}
                                    onChange={(e) => setClarityId(e.target.value)}
                                    placeholder="Project ID (e.g. a8b7c6d5e4)"
                                    disabled={saving}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Injects Microsoft Clarity user behavior analytics tracking code.</span>
                            </div>

                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                <label className="form-label">Facebook Meta Pixel ID</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={pixelId}
                                    onChange={(e) => setPixelId(e.target.value)}
                                    placeholder="Pixel ID (e.g. 123456789012345)"
                                    disabled={saving}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deploys the Meta Pixel Javascript library and noscript tracking pixel image.</span>
                            </div>
                        </div>
                    )}

                    {/* Actions panel */}
                    <div className="admin-actions-panel" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                        <button 
                            type="button" 
                            onClick={handleReset}
                            className="btn-submit"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--border-glass)',
                                color: 'var(--text-muted)',
                            }}
                            disabled={saving}
                        >
                            Reset Defaults
                        </button>
                        
                        <button 
                            type="submit" 
                            className="btn-submit"
                            disabled={saving}
                        >
                            {saving ? 'Updating Code Injection...' : 'Save & Publish Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
