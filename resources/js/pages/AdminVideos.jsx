import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useUpload } from '../components/UploadContext';

export default function AdminVideos() {
    const { addToQueue, lastCompletedUpload, setLastCompletedUpload } = useUpload();

    const [videos, setVideos] = useState([]);
    const [pagination, setPagination] = useState({});
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Drag and drop state
    const [dragActive, setDragActive] = useState(false);


    // Edit modal states
    const [editingVideo, setEditingVideo]               = useState(null);
    const [editTitle, setEditTitle]                     = useState('');
    const [editDescription, setEditDescription]         = useState('');
    const [editThumbnail, setEditThumbnail]             = useState('');
    const [editStatus, setEditStatus]                   = useState('published');
    const [editThumbnailsLoading, setEditThumbnailsLoading] = useState(false);
    const [editTempThumbnails, setEditTempThumbnails]   = useState([]);
    const [editTempPrefix, setEditTempPrefix]           = useState('');

    // Multiple selection state
    const [selectedIds, setSelectedIds] = useState([]);

    // Search, filter, sorting states
    const [search, setSearch]         = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy]         = useState('created_at');
    const [sortOrder, setSortOrder]   = useState('desc');

    useEffect(() => {
        loadVideos(page);
    }, [page, statusFilter, sortBy, sortOrder]);

    // Handle completed queue upload notification
    useEffect(() => {
        if (lastCompletedUpload && lastCompletedUpload.type === 'video') {
            loadVideos(1);
            setLastCompletedUpload(null);
        }
    }, [lastCompletedUpload]);

    const loadVideos = (pageNum) => {
        setLoading(true);
        axios.get(`/api/admin/videos`, {
            params: { page: pageNum, search, status: statusFilter, sortBy, sortOrder, per_page: 500 }
        })
            .then(res => {
                setVideos(res.data.data);
                setPagination(res.data);
                setSelectedIds([]);
            })
            .catch(err => console.error('Error loading admin videos:', err))
            .finally(() => setLoading(false));
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadVideos(1);
    };

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
        setPage(1);
    };

    const handleCheckboxChange = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSelectAll = () => {
        setSelectedIds(selectedIds.length === videos.length ? [] : videos.map(v => v.id));
    };

    const handleBulkDelete = () => {
        if (!confirm(`Delete ${selectedIds.length} selected video(s) and all their files permanently?`)) return;
        setLoading(true);
        axios.post('/api/admin/videos/bulk-delete', { ids: selectedIds })
            .then(() => { setSelectedIds([]); loadVideos(page); })
            .catch(() => alert('Failed to delete selected videos.'))
            .finally(() => setLoading(false));
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type === 'dragenter' || e.type === 'dragover');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.length) addToQueue(e.dataTransfer.files, 'video');
    };

    const handleFileSelect = (e) => {
        if (e.target.files?.length) addToQueue(e.target.files, 'video');
    };


    // ── Edit modal ────────────────────────────────────────────────────
    const handleEditClick = (video) => {
        setEditingVideo(video);
        setEditTitle(video.title || '');
        setEditDescription(video.description || '');
        setEditThumbnail(video.thumbnail_path || '');
        setEditStatus(video.status);
        setEditTempPrefix('');

        setEditThumbnailsLoading(true);
        setEditTempThumbnails([]);
        axios.post(`/api/admin/videos/${video.id}/regenerate-thumbnails`)
            .then(res => {
                const thumbs = res.data.temp_thumbnails || [];
                setEditTempThumbnails(thumbs);
                if (thumbs.length > 0) {
                    const firstThumb = thumbs[0];
                    const parts = firstThumb.split('temp-thumbnails/');
                    if (parts.length === 2) {
                        const filename = parts[1];
                        const nameParts = filename.split('_');
                        if (nameParts.length >= 3) {
                            nameParts.pop(); // timestamp
                            nameParts.pop(); // index
                            const prefix = nameParts.join('_');
                            setEditTempPrefix(prefix);
                        }
                    }
                }
            })
            .catch(err => console.error('Failed to regenerate thumbnails:', err))
            .finally(() => setEditThumbnailsLoading(false));
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        axios.put(`/api/admin/videos/${editingVideo.id}`, {
            title: editTitle,
            description: editDescription,
            thumbnail_path: editThumbnail,
            status: editStatus,
        })
        .then(() => { setEditingVideo(null); setEditTempPrefix(''); loadVideos(page); })
        .catch(err => console.error('Failed to update video:', err));
    };

    const handleCancelEdit = () => {
        if (editTempPrefix) {
            axios.post('/api/admin/videos/cleanup-temp-thumbnails', { prefix: editTempPrefix })
                .catch(err => console.error('Failed to clean up temp thumbnails:', err));
        }
        setEditingVideo(null);
        setEditTempPrefix('');
    };

    const handleDeleteClick = (id) => {
        if (!confirm('Delete this video and all its files permanently?')) return;
        axios.delete(`/api/admin/videos/${id}`)
            .then(() => loadVideos(page))
            .catch(err => console.error('Failed to delete video:', err));
    };

    const formatDuration = (secs) => {
        if (!secs) return '00:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div>
            <h2 className="admin-panel-title">Manage Videos</h2>

            {/* ── Upload Dropzone ──────────────────────────────────── */}
            <div
                className={`glass-panel dropzone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{
                    padding: '2.5rem 1.5rem',
                    marginBottom: '2.5rem',
                    textAlign: 'center',
                    border: '2px dashed rgba(255,255,255,0.15)',
                    borderColor: dragActive ? '#4096ff' : 'rgba(255,255,255,0.15)',
                    borderRadius: '16px',
                    background: dragActive ? 'rgba(64,150,255,0.05)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
                onClick={() => document.getElementById('video-input-file').click()}
            >
                <input
                    id="video-input-file"
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📤</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
                    Drag &amp; Drop Video Files
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: 480 }}>
                    Or click to browse. Supports 1–100+ files at once. Title auto-fills from filename.
                </p>
                <button type="button" className="admin-btn admin-btn-primary" style={{ pointerEvents: 'none', padding: '8px 20px' }}>
                    Select Videos
                </button>
            </div>


            {/* ── Bulk Actions Bar ─────────────────────────────────── */}
            {selectedIds.length > 0 && (
                <div className="glass-panel" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.5rem', marginBottom: '1.5rem',
                    background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)',
                    borderRadius: '12px', flexWrap: 'wrap', gap: '12px',
                }}>
                    <div style={{ color: '#fff', fontWeight: 600 }}>
                        Selected <span style={{ color: 'var(--secondary)', fontSize: '1.1rem', fontWeight: 700 }}>{selectedIds.length}</span> {selectedIds.length === 1 ? 'video' : 'videos'}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" className="admin-btn admin-btn-danger" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={handleBulkDelete}>
                            🗑️ Delete Selected
                        </button>
                        <button type="button" className="admin-btn admin-btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={() => setSelectedIds([])}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Search + Filter Bar ──────────────────────────────── */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: 0 }}>
                    <input
                        type="text"
                        className="form-control"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by title…"
                        style={{ margin: 0, flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button type="submit" className="admin-btn admin-btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>🔍</button>
                    {search && (
                        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => { setSearch(''); loadVideos(1); }} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Clear
                        </button>
                    )}
                </form>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Status:</label>
                    <select
                        className="form-control"
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ margin: 0, width: 'auto', minWidth: '110px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <option value="">All</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
            </div>

            {/* ── All Videos Header ────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '12px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: 0 }}>All Videos</h3>
                {videos.length > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', userSelect: 'none' }}>
                        <input
                            type="checkbox"
                            checked={videos.length > 0 && selectedIds.length === videos.length}
                            onChange={handleSelectAll}
                            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--secondary)' }}
                        />
                        Select All
                    </label>
                )}
            </div>

            {loading && videos.length === 0 ? (
                <div className="spinner" />
            ) : videos.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No videos found. Upload your first video above.
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input type="checkbox" checked={videos.length > 0 && selectedIds.length === videos.length} onChange={handleSelectAll} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--secondary)' }} />
                                </th>
                                <th>Thumbnail</th>
                                <th onClick={() => handleSort('title')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Title {sortBy === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th onClick={() => handleSort('duration')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Duration {sortBy === 'duration' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th onClick={() => handleSort('views')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Views {sortBy === 'views' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Status {sortBy === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Created {sortBy === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {videos.map(video => (
                                <tr key={video.id} style={{ background: selectedIds.includes(video.id) ? 'rgba(0,243,255,0.03)' : '' }}>
                                    <td className="col-checkbox" style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={selectedIds.includes(video.id)} onChange={() => handleCheckboxChange(video.id)} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--secondary)' }} />
                                    </td>
                                    <td className="col-thumbnail">
                                        <img src={video.thumbnail_path} alt="" style={{ width: 80, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)' }} />
                                    </td>
                                    <td className="col-title">
                                        <div style={{ fontWeight: 600, color: '#fff' }}>{video.title}</div>
                                    </td>
                                    <td className="col-badge">{formatDuration(video.duration)}</td>
                                    <td className="col-badge">{video.views.toLocaleString()}</td>
                                    <td className="col-badge">
                                        <span style={{
                                            padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 'bold',
                                            background: video.status === 'published' ? 'rgba(0,243,255,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: video.status === 'published' ? 'var(--secondary)' : 'var(--text-muted)',
                                        }}>
                                            {video.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="col-badge">{new Date(video.created_at).toLocaleDateString()}</td>
                                    <td className="col-actions">
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => handleEditClick(video)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Edit</button>
                                            <button onClick={() => handleDeleteClick(video.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {pagination.last_page > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: '1.5rem' }}>
                            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="admin-btn admin-btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Previous</button>
                            <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>Page {page} of {pagination.last_page}</span>
                            <button disabled={page === pagination.last_page} onClick={() => setPage(page + 1)} className="admin-btn admin-btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Edit Video Modal ─────────────────────────────────── */}
            {editingVideo && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h3 className="modal-title">Edit Video Details</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group">
                                <label className="form-label">
                                    Title <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(optional — auto-fills from filename if empty)</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    placeholder="Leave empty to keep current title"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-control"
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    style={{ height: 80, resize: 'vertical' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select className="form-control" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Select Thumbnail</label>
                                {editThumbnailsLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '10px 0' }}>
                                        <div className="spinner" style={{ width: 20, height: 20, margin: 0 }} />
                                        <span style={{ fontSize: '0.9rem' }}>Extracting fresh thumbnails from video…</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                                        {editTempThumbnails.map((thumb, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setEditThumbnail(thumb)}
                                                style={{
                                                    borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                                                    border: editThumbnail === thumb ? '3px solid #4096ff' : '3px solid transparent',
                                                    transition: 'border-color 0.15s',
                                                    position: 'relative',
                                                }}
                                            >
                                                <img src={thumb} alt="" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                                                {editThumbnail === thumb && (
                                                    <div style={{
                                                        position: 'absolute', top: 4, right: 4,
                                                        background: '#4096ff', color: '#fff',
                                                        borderRadius: '50%', width: 18, height: 18,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 10, fontWeight: 700,
                                                    }}>✓</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={handleCancelEdit} className="admin-btn admin-btn-secondary">Cancel</button>
                                <button type="submit" className="admin-btn admin-btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
