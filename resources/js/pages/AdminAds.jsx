import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminAds() {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [ads, setAds] = useState([]);
    const [pagination, setPagination] = useState({});
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form states
    const [title, setTitle] = useState('');
    const [type, setType] = useState('banner'); // banner, popup, native
    const [placement, setPlacement] = useState('home_top'); // home_top, home_middle, video_sidebar, video_bottom, reels_between
    const [targetDevice, setTargetDevice] = useState('both'); // desktop, mobile, both
    const [imageFile, setImageFile] = useState(null);
    const [redirectUrl, setRedirectUrl] = useState('');
    const [adCode, setAdCode] = useState('');
    const [status, setStatus] = useState('active');
    const [mediaType, setMediaType] = useState('image'); // image, video, gif
    const [adDuration, setAdDuration] = useState('');

    // Edit modal states
    const [editingAd, setEditingAd] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editType, setEditType] = useState('banner');
    const [editPlacement, setEditPlacement] = useState('home_top');
    const [editTargetDevice, setEditTargetDevice] = useState('both');
    const [editImageFile, setEditImageFile] = useState(null);
    const [editRedirectUrl, setEditRedirectUrl] = useState('');
    const [editAdCode, setEditAdCode] = useState('');
    const [editStatus, setEditStatus] = useState('active');
    const [editMediaType, setEditMediaType] = useState('image');
    const [editAdDuration, setEditAdDuration] = useState('');

    useEffect(() => {
        loadAds(page);
    }, [page]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const loadAds = (pageNum) => {
        setLoading(true);
        axios.get(`/api/admin/ads?page=${pageNum}`)
            .then(res => {
                setAds(res.data.data);
                setPagination(res.data);
            })
            .catch(err => console.error("Error loading ads:", err))
            .finally(() => setLoading(false));
    };

    const handleCreateSubmit = (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('title', title);
        formData.append('type', type);
        formData.append('placement', placement);
        formData.append('target_device', targetDevice);
        formData.append('status', status);
        formData.append('media_type', mediaType);
        if (adDuration) formData.append('ad_duration', adDuration);
        
        if (imageFile) formData.append('image', imageFile);
        if (redirectUrl) formData.append('redirect_url', redirectUrl);
        if (adCode) formData.append('ad_code', adCode);

        axios.post('/api/admin/ads', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        .then(() => {
            // Reset form
            setTitle('');
            setType('banner');
            setPlacement('home_top');
            setTargetDevice('both');
            setImageFile(null);
            setRedirectUrl('');
            setAdCode('');
            setStatus('active');
            setMediaType('image');
            setAdDuration('');
            
            const fileInput = document.getElementById('ad-image-file');
            if (fileInput) fileInput.value = '';

            loadAds(1);
        })
        .catch(err => {
            console.error("Failed to create ad:", err);
            alert("Failed to create ad. Check form inputs.");
        });
    };

    const handleEditClick = (ad) => {
        setEditingAd(ad);
        setEditTitle(ad.title);
        setEditType(ad.type);
        setEditPlacement(ad.placement);
        setEditTargetDevice(ad.target_device);
        setEditRedirectUrl(ad.redirect_url || '');
        setEditAdCode(ad.ad_code || '');
        setEditStatus(ad.status);
        setEditMediaType(ad.media_type || 'image');
        setEditAdDuration(ad.ad_duration || '');
        setEditImageFile(null);
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('_method', 'PUT'); // Laravel request spoofing for file uploads on PUT
        formData.append('title', editTitle);
        formData.append('type', editType);
        formData.append('placement', editPlacement);
        formData.append('target_device', editTargetDevice);
        formData.append('status', editStatus);
        formData.append('redirect_url', editRedirectUrl);
        formData.append('ad_code', editAdCode);
        formData.append('media_type', editMediaType);
        if (editAdDuration !== '') formData.append('ad_duration', editAdDuration);
        
        if (editImageFile) formData.append('image', editImageFile);

        axios.post(`/api/admin/ads/${editingAd.id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        .then(() => {
            setEditingAd(null);
            loadAds(page);
        })
        .catch(err => {
            console.error("Failed to update ad:", err);
            alert("Failed to update advertisement.");
        });
    };

    const handleDeleteClick = (adId) => {
        if (!confirm("Are you sure you want to delete this ad permanently?")) return;

        axios.delete(`/api/admin/ads/${adId}`)
            .then(() => {
                loadAds(page);
            })
            .catch(err => console.error("Failed to delete ad:", err));
    };

    return (
        <div>
            <h2 className="admin-panel-title">Manage Advertisements</h2>

            {/* Create Advertisement Form */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#fff' }}>Create Advertisement</h3>
                <form onSubmit={handleCreateSubmit}>
                    <div className="admin-form-grid">
                        <div className="form-group">
                            <label className="form-label">Ad Name/Title</label>
                            <input 
                                type="text" 
                                className="form-control"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="E.g., Summer Banner Sale"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Ad Type</label>
                            <select 
                                className="form-control"
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                <option value="banner">Image Banner</option>
                                <option value="native">Native Code Block</option>
                                <option value="popup">Pop-up overlay</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Placement position</label>
                            <select 
                                className="form-control"
                                value={placement}
                                onChange={(e) => setPlacement(e.target.value)}
                            >
                                <option value="home_top">Homepage Top (Banner)</option>
                                <option value="home_middle">Homepage Middle (Grid interleave)</option>
                                <option value="homepage_row_1_ad">Homepage Row 1 Advertisement</option>
                                <option value="homepage_row_2_ad">Homepage Row 2 Advertisement</option>
                                <option value="homepage_row_3_ad">Homepage Row 3 Advertisement</option>
                                <option value="homepage_row_4_ad">Homepage Row 4 Advertisement</option>
                                <option value="homepage_row_5_ad">Homepage Row 5 Advertisement</option>
                                <option value="homepage_default_ad">Homepage Default Advertisement</option>
                                <option value="video_sidebar">Video Player Sidebar (Medium rectangle)</option>
                                <option value="video_bottom">Video Player Bottom</option>
                                <option value="video_player_overlay">Video Player Overlay (Skip Ad)</option>
                                <option value="recommended_videos_banner">Recommended Videos Banner</option>
                                <option value="video_above_comments">Video Player Above Comments</option>
                                <option value="footer_top">Footer Top (Global)</option>
                                <option value="reels_between">Reels snap scroll interleave</option>
                                <option value="reels_overlay_top">Reels Overlay Top (Banner/HTML)</option>
                                <option value="video_grid_inline">Homepage Video Grid Inline (Desktop Rows)</option>
                                <option value="mobile_video_feed_ad">Homepage Mobile Video Feed Inline Ad</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Device Target</label>
                            <select 
                                className="form-control"
                                value={targetDevice}
                                onChange={(e) => setTargetDevice(e.target.value)}
                            >
                                <option value="both">Both (Responsive)</option>
                                <option value="desktop">Desktop Only</option>
                                <option value="mobile">Mobile Only</option>
                            </select>
                        </div>
                    </div>

                    {placement === 'video_player_overlay' && (
                        <div className="form-group" style={{ marginTop: '10px' }}>
                            <label className="form-label">Skip Ad Duration (Seconds)</label>
                            <input 
                                type="number" 
                                className="form-control"
                                value={adDuration}
                                onChange={(e) => setAdDuration(e.target.value)}
                                placeholder="E.g., 5, 10, 15, 30"
                                min="1"
                                required
                            />
                        </div>
                    )}

                    {type !== 'native' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            <div className="admin-form-grid" style={{ marginTop: '10px' }}>
                                <div className="form-group">
                                    <label className="form-label">Media File (Image/Video/GIF)</label>
                                    <input 
                                        id="ad-image-file"
                                        type="file" 
                                        className="form-control"
                                        accept="image/*,video/*"
                                        onChange={(e) => setImageFile(e.target.files[0])}
                                        required={type === 'banner'}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Redirect Link (URL)</label>
                                    <input 
                                        type="url" 
                                        className="form-control"
                                        value={redirectUrl}
                                        onChange={(e) => setRedirectUrl(e.target.value)}
                                        placeholder="https://example.com/promo"
                                        required={type === 'banner'}
                                    />
                                </div>
                            </div>
                            <div className="admin-form-grid">
                                <div className="form-group">
                                    <label className="form-label">Media Type</label>
                                    <select 
                                        className="form-control"
                                        value={mediaType}
                                        onChange={(e) => setMediaType(e.target.value)}
                                    >
                                        <option value="image">Image</option>
                                        <option value="video">Video</option>
                                        <option value="gif">GIF</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="form-group" style={{ marginTop: '10px' }}>
                            <label className="form-label">Custom script / AdSense code</label>
                            <textarea 
                                className="form-control"
                                value={adCode}
                                onChange={(e) => setAdCode(e.target.value)}
                                placeholder="Paste your AdSense <ins> or iframe script here"
                                style={{ height: '100px', resize: 'vertical' }}
                                required={type === 'native'}
                            />
                        </div>
                    )}

                    <div className="form-group" style={{ marginTop: '10px' }}>
                        <label className="form-label">Status</label>
                        <select 
                            className="form-control"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            style={{ width: isMobile ? '100%' : '150px' }}
                        >
                            <option value="active">Active (Visible)</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    <button type="submit" className="btn-submit" style={{ marginTop: '15px' }}>
                        Save Advertisement
                    </button>
                </form>
            </div>

            {/* Ads List Table */}
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', color: '#fff' }}>Active Configurations</h3>
            {loading && ads.length === 0 ? (
                <div className="spinner"></div>
            ) : ads.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No advertisements configured. Create one above.
                </div>
            ) : (
                <div className="table-responsive">
                    {/* Mobile: Card layout */}
                    {isMobile ? (
                        <div className="admin-ads-card-list">
                            {ads.map(ad => (
                                <div key={ad.id} className="admin-ad-card">
                                    <div className="admin-ad-card-header">
                                        <div className="admin-ad-card-title">{ad.title}</div>
                                        <span className={`admin-ad-card-status ${ad.status === 'active' ? 'active' : ''}`}>
                                            {ad.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="admin-ad-card-badges">
                                        <span className="admin-ad-badge">{ad.placement}</span>
                                        <span className="admin-ad-badge">{ad.type.toUpperCase()}</span>
                                        <span className="admin-ad-badge">{ad.target_device.toUpperCase()}</span>
                                    </div>
                                    <div className="admin-ad-card-stats">
                                        <div className="admin-ad-stat">
                                            <span className="admin-ad-stat-label">Impressions</span>
                                            <span className="admin-ad-stat-value">{ad.impressions?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="admin-ad-stat">
                                            <span className="admin-ad-stat-label">Clicks</span>
                                            <span className="admin-ad-stat-value">{ad.clicks?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="admin-ad-stat">
                                            <span className="admin-ad-stat-label">CTR</span>
                                            <span className="admin-ad-stat-value">{ad.ctr !== undefined ? `${ad.ctr}%` : '0%'}</span>
                                        </div>
                                    </div>
                                    <div className="admin-ad-card-actions">
                                        <button onClick={() => handleEditClick(ad)} className="admin-btn admin-btn-secondary" style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}>
                                            Edit
                                        </button>
                                        <button onClick={() => handleDeleteClick(ad.id)} className="admin-btn admin-btn-danger" style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Placement</th>
                                <th>Type</th>
                                <th>Device</th>
                                <th>Impressions</th>
                                <th>Clicks</th>
                                <th>CTR</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ads.map(ad => (
                                <tr key={ad.id}>
                                    <td style={{ fontWeight: '600', color: '#fff' }}>{ad.title}</td>
                                    <td>{ad.placement}</td>
                                    <td>{ad.type.toUpperCase()}{ad.type !== 'native' ? ` (${ad.media_type.toUpperCase()})` : ''}</td>
                                    <td>{ad.target_device.toUpperCase()}</td>
                                    <td>{ad.impressions?.toLocaleString() || 0}</td>
                                    <td>{ad.clicks?.toLocaleString() || 0}</td>
                                    <td>{ad.ctr !== undefined ? `${ad.ctr}%` : '0%'}</td>
                                    <td style={{ color: ad.status === 'active' ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                        {ad.status.toUpperCase()}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => handleEditClick(ad)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Edit
                                            </button>
                                            <button onClick={() => handleDeleteClick(ad.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>
            )}

            {/* Edit Ad Modal */}
            {editingAd && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h3 className="modal-title">Edit Advertisement</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group">
                                <label className="form-label">Ad Name/Title</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Placement Position</label>
                                <select 
                                    className="form-control"
                                    value={editPlacement}
                                    onChange={(e) => setEditPlacement(e.target.value)}
                                >
                                    <option value="home_top">Homepage Top (Banner)</option>
                                    <option value="home_middle">Homepage Middle (Grid interleave)</option>
                                    <option value="homepage_row_1_ad">Homepage Row 1 Advertisement</option>
                                    <option value="homepage_row_2_ad">Homepage Row 2 Advertisement</option>
                                    <option value="homepage_row_3_ad">Homepage Row 3 Advertisement</option>
                                    <option value="homepage_row_4_ad">Homepage Row 4 Advertisement</option>
                                    <option value="homepage_row_5_ad">Homepage Row 5 Advertisement</option>
                                    <option value="homepage_default_ad">Homepage Default Advertisement</option>
                                    <option value="video_sidebar">Video Player Sidebar (Medium rectangle)</option>
                                    <option value="video_bottom">Video Player Bottom</option>
                                    <option value="video_player_overlay">Video Player Overlay (Skip Ad)</option>
                                    <option value="recommended_videos_banner">Recommended Videos Banner</option>
                                    <option value="video_above_comments">Video Player Above Comments</option>
                                    <option value="footer_top">Footer Top (Global)</option>
                                    <option value="reels_between">Reels snap scroll interleave</option>
                                    <option value="reels_overlay_top">Reels Overlay Top (Banner/HTML)</option>
                                    <option value="video_grid_inline">Homepage Video Grid Inline (Desktop Rows)</option>
                                    <option value="mobile_video_feed_ad">Homepage Mobile Video Feed Inline Ad</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Device Target</label>
                                <select 
                                    className="form-control"
                                    value={editTargetDevice}
                                    onChange={(e) => setEditTargetDevice(e.target.value)}
                                >
                                    <option value="both">Both (Responsive)</option>
                                    <option value="desktop">Desktop Only</option>
                                    <option value="mobile">Mobile Only</option>
                                </select>
                            </div>

                            {editPlacement === 'video_player_overlay' && (
                                <div className="form-group">
                                    <label className="form-label">Skip Ad Duration (Seconds)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={editAdDuration}
                                        onChange={(e) => setEditAdDuration(e.target.value)}
                                        placeholder="E.g., 5, 10, 15, 30"
                                        min="1"
                                        required
                                    />
                                </div>
                            )}

                            {editType !== 'native' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                                    <div className="admin-form-grid">
                                        <div className="form-group">
                                            <label className="form-label">Change Media File (Optional)</label>
                                            <input 
                                                type="file" 
                                                className="form-control"
                                                accept="image/*,video/*"
                                                onChange={(e) => setEditImageFile(e.target.files[0])}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Redirect Link (URL)</label>
                                            <input 
                                                type="url" 
                                                className="form-control"
                                                value={editRedirectUrl}
                                                onChange={(e) => setEditRedirectUrl(e.target.value)}
                                                required={editType === 'banner'}
                                            />
                                        </div>
                                    </div>
                                    <div className="admin-form-grid">
                                        <div className="form-group">
                                            <label className="form-label">Media Type</label>
                                            <select 
                                                className="form-control"
                                                value={editMediaType}
                                                onChange={(e) => setEditMediaType(e.target.value)}
                                            >
                                                <option value="image">Image</option>
                                                <option value="video">Video</option>
                                                <option value="gif">GIF</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Custom script / AdSense code</label>
                                    <textarea 
                                        className="form-control"
                                        value={editAdCode}
                                        onChange={(e) => setEditAdCode(e.target.value)}
                                        style={{ height: '100px', resize: 'vertical' }}
                                        required={editType === 'native'}
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select 
                                    className="form-control"
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingAd(null)} className="admin-btn admin-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" className="admin-btn admin-btn-primary">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
