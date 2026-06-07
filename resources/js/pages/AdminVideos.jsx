import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useUpload } from '../components/UploadContext';

export default function AdminVideos() {
    const { addToQueue, lastCompletedUpload, setLastCompletedUpload } = useUpload();

    const [videos, setVideos] = useState([]);
    const [pagination, setPagination] = useState({});
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Drag and drop states
    const [dragActive, setDragActive] = useState(false);
    
    // Thumbnail selector state
    const [processingVideo, setProcessingVideo] = useState(null); // stores video model after upload is done

    // Edit modal states
    const [editingVideo, setEditingVideo] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editThumbnail, setEditThumbnail] = useState('');
    const [editStatus, setEditStatus] = useState('published');
    
    // Multiple selection state
    const [selectedIds, setSelectedIds] = useState([]);

    // Search, filter, and sorting states
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    useEffect(() => {
        loadVideos(page);
    }, [page, statusFilter, sortBy, sortOrder]);

    // Handle completed queue upload notification
    useEffect(() => {
        if (lastCompletedUpload && lastCompletedUpload.type === 'video') {
            setProcessingVideo(lastCompletedUpload.model);
            loadVideos(1);
            setLastCompletedUpload(null);
        }
    }, [lastCompletedUpload]);

    const loadVideos = (pageNum) => {
        setLoading(true);
        axios.get(`/api/admin/videos`, {
            params: {
                page: pageNum,
                search: search,
                status: statusFilter,
                sortBy: sortBy,
                sortOrder: sortOrder,
                per_page: 500
            }
        })
            .then(res => {
                setVideos(res.data.data);
                setPagination(res.data);
                setSelectedIds([]); // reset selection on reload/page change
            })
            .catch(err => console.error("Error loading admin videos:", err))
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
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === videos.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(videos.map(video => video.id));
        }
    };

    const handleBulkDelete = () => {
        if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected videos and all their files permanently?`)) return;

        setLoading(true);
        axios.post('/api/admin/videos/bulk-delete', { ids: selectedIds })
            .then(() => {
                setSelectedIds([]);
                loadVideos(page);
            })
            .catch(err => {
                console.error("Failed to bulk delete videos:", err);
                alert("Failed to delete selected videos.");
            })
            .finally(() => setLoading(false));
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addToQueue(e.dataTransfer.files, 'video');
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            addToQueue(e.target.files, 'video');
        }
    };

    const handleSelectThumbnail = (video, thumbUrl) => {
        axios.put(`/api/admin/videos/${video.id}`, {
            title: video.title,
            description: video.description,
            thumbnail_path: thumbUrl,
            status: video.status
        })
        .then(res => {
            if (processingVideo && processingVideo.id === video.id) {
                setProcessingVideo(null); // Upload flow finished
            }
            if (editingVideo && editingVideo.id === video.id) {
                setEditThumbnail(thumbUrl);
            }
            loadVideos(page);
        })
        .catch(err => console.error("Failed to select thumbnail:", err));
    };

    const handleEditClick = (video) => {
        setEditingVideo(video);
        setEditTitle(video.title);
        setEditDescription(video.description || '');
        setEditThumbnail(video.thumbnail_path || '');
        setEditStatus(video.status);
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        axios.put(`/api/admin/videos/${editingVideo.id}`, {
            title: editTitle,
            description: editDescription,
            thumbnail_path: editThumbnail,
            status: editStatus
        })
        .then(res => {
            setEditingVideo(null);
            loadVideos(page);
        })
        .catch(err => console.error("Failed to update video:", err));
    };

    const handleDeleteClick = (videoId) => {
        if (!confirm("Are you sure you want to delete this video and all its files permanently?")) return;

        axios.delete(`/api/admin/videos/${videoId}`)
            .then(() => {
                loadVideos(page);
            })
            .catch(err => console.error("Failed to delete video:", err));
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div>
            <h2 className="admin-panel-title">Manage Videos</h2>

            {/* Video Upload Dropzone */}
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
                    border: '2px dashed rgba(255, 255, 255, 0.15)',
                    borderColor: dragActive ? '#1890ff' : 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '16px',
                    background: dragActive ? 'rgba(24, 144, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
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
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
                    Drag & Drop Video Files
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: '100%', padding: '0 0.5rem' }}>
                    or click to browse your files. Supports multiple file uploads. Filename will be used as the default video title.
                </p>
                <button 
                    type="button" 
                    className="admin-btn admin-btn-primary"
                    style={{ pointerEvents: 'none', padding: '8px 20px' }}
                >
                    Select Videos
                </button>
            </div>

            {/* FFmpeg Video Thumbnail Selector Banner after Upload */}
            {processingVideo && (
                <div className="notice-banner" style={{ background: 'rgba(0, 243, 255, 0.08)', borderColor: 'rgba(0, 243, 255, 0.25)', padding: '1.5rem', marginBottom: '2rem' }}>
                    <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select Video Thumbnail</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        FFmpeg automatically extracted 5 thumbnails from your video. Select the official display thumbnail:
                    </p>
                    <div className="thumbnail-selector-grid">
                        {processingVideo.all_thumbnails && processingVideo.all_thumbnails.map((thumb, idx) => (
                            <div 
                                key={idx} 
                                className={`thumbnail-option ${processingVideo.thumbnail_path === thumb ? 'selected' : ''}`}
                                onClick={() => handleSelectThumbnail(processingVideo, thumb)}
                            >
                                <img src={thumb} alt={`Thumbnail ${idx + 1}`} />
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                        <button onClick={() => setProcessingVideo(null)} className="admin-btn admin-btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                            Done / Keep Selection
                        </button>
                    </div>
                </div>
            )}

            {/* Bulk Actions Bar */}
            {selectedIds.length > 0 && (
                <div className="glass-panel admin-bulk-actions" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    marginBottom: '1.5rem',
                    background: 'rgba(255, 77, 79, 0.08)',
                    borderColor: 'rgba(255, 77, 79, 0.25)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderRadius: '12px',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ color: '#fff', fontWeight: '600' }}>
                        Selected <span style={{ color: 'var(--secondary)', fontSize: '1.1rem', fontWeight: '700' }}>{selectedIds.length}</span> {selectedIds.length === 1 ? 'video' : 'videos'}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            type="button" 
                            className="admin-btn admin-btn-danger" 
                            style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={handleBulkDelete}
                        >
                            🗑️ Delete Selected
                        </button>
                        <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary" 
                            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => setSelectedIds([])}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Search and Filters Bar */}
            <div className="admin-search-filter-bar" style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <form onSubmit={handleSearchSubmit} className="admin-search-form" style={{ display: 'flex', gap: '8px', flex: '1', minWidth: '0' }}>
                    <input 
                        type="text" 
                        className="form-control" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by title..."
                        style={{ margin: 0, flex: '1', minWidth: '0', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button type="submit" className="admin-btn admin-btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        🔍
                    </button>
                    {search && (
                        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => { setSearch(''); axios.get('/api/admin/videos', { params: { page: 1, status: statusFilter, sortBy, sortOrder, per_page: 500 } }).then(res => { setVideos(res.data.data); setPagination(res.data); setPage(1); }); }} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Clear
                        </button>
                    )}
                </form>
                <div className="admin-filter-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Status:</label>
                    <select 
                        className="form-control" 
                        value={statusFilter} 
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ margin: 0, width: 'auto', minWidth: '110px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <option value="">All</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
            </div>

            {/* Videos List Header with Select All */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '12px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', margin: 0 }}>All Videos</h3>
                {videos.length > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', userSelect: 'none' }}>
                        <input 
                            type="checkbox" 
                            checked={videos.length > 0 && selectedIds.length === videos.length}
                            onChange={handleSelectAll}
                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--secondary)' }}
                        />
                        Select All
                    </label>
                )}
            </div>
            {loading && videos.length === 0 ? (
                <div className="spinner"></div>
            ) : videos.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No videos found. Upload your first video above.
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={videos.length > 0 && selectedIds.length === videos.length}
                                        onChange={handleSelectAll}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--secondary)' }}
                                    />
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
                                    Created Date {sortBy === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {videos.map(video => (
                                <tr key={video.id} style={{ background: selectedIds.includes(video.id) ? 'rgba(0, 243, 255, 0.03)' : '' }}>
                                    <td className="col-checkbox" style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.includes(video.id)}
                                            onChange={() => handleCheckboxChange(video.id)}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--secondary)' }}
                                        />
                                    </td>
                                    <td className="col-thumbnail">
                                        <img src={video.thumbnail_path} alt="" style={{ width: '80px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' }} />
                                    </td>
                                    <td className="col-title">
                                        <div style={{ fontWeight: '600', color: '#fff' }}>{video.title}</div>
                                    </td>
                                    <td className="col-badge">{formatDuration(video.duration)}</td>
                                    <td className="col-badge">{video.views.toLocaleString()}</td>
                                    <td className="col-badge">
                                        <span style={{
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            background: video.status === 'published' ? 'rgba(0, 243, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                            color: video.status === 'published' ? 'var(--secondary)' : 'var(--text-muted)'
                                        }}>
                                            {video.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="col-badge">
                                        {new Date(video.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="col-actions">
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => handleEditClick(video)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Edit
                                            </button>
                                            <button onClick={() => handleDeleteClick(video.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination Buttons */}
                    {pagination.last_page > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '1.5rem' }}>
                            <button 
                                disabled={page === 1} 
                                onClick={() => setPage(page - 1)} 
                                className="admin-btn admin-btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                                Previous
                            </button>
                            <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>Page {page} of {pagination.last_page}</span>
                            <button 
                                disabled={page === pagination.last_page} 
                                onClick={() => setPage(page + 1)} 
                                className="admin-btn admin-btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Edit Video Modal */}
            {editingVideo && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h3 className="modal-title">Edit Video Details</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group">
                                <label className="form-label">Title</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea 
                                    className="form-control"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    style={{ height: '80px', resize: 'vertical' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select 
                                    className="form-control"
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                >
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Select Official Display Thumbnail</label>
                                <div className="thumbnail-selector-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                                    {editingVideo.all_thumbnails && editingVideo.all_thumbnails.map((thumb, idx) => (
                                        <div 
                                            key={idx} 
                                            className={`thumbnail-option ${editThumbnail === thumb ? 'selected' : ''}`}
                                            onClick={() => setEditThumbnail(thumb)}
                                        >
                                            <img src={thumb} alt="" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingVideo(null)} className="admin-btn admin-btn-secondary">
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
