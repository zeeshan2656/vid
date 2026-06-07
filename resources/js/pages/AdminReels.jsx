import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useUpload } from '../components/UploadContext';

export default function AdminReels() {
    const { addToQueue, lastCompletedUpload, setLastCompletedUpload } = useUpload();

    const [reels, setReels] = useState([]);
    const [pagination, setPagination] = useState({});
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Drag and drop states
    const [dragActive, setDragActive] = useState(false);

    // Edit modal states
    const [editingReel, setEditingReel] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStatus, setEditStatus] = useState('published');

    // Multiple selection state
    const [selectedIds, setSelectedIds] = useState([]);

    useEffect(() => {
        loadReels(page);
    }, [page]);

    // Handle completed queue upload notification
    useEffect(() => {
        if (lastCompletedUpload && lastCompletedUpload.type === 'reel') {
            loadReels(1);
            setLastCompletedUpload(null);
        }
    }, [lastCompletedUpload]);

    const loadReels = (pageNum) => {
        setLoading(true);
        axios.get(`/api/admin/reels`, {
            params: {
                page: pageNum,
                per_page: 500
            }
        })
            .then(res => {
                setReels(res.data.data);
                setPagination(res.data);
                setSelectedIds([]); // reset selection on reload/page change
            })
            .catch(err => console.error("Error loading admin reels:", err))
            .finally(() => setLoading(false));
    };

    const handleCheckboxChange = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === reels.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(reels.map(reel => reel.id));
        }
    };

    const handleBulkDelete = () => {
        if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected reels and all their files permanently?`)) return;

        setLoading(true);
        axios.post('/api/admin/reels/bulk-delete', { ids: selectedIds })
            .then(() => {
                setSelectedIds([]);
                loadReels(page);
            })
            .catch(err => {
                console.error("Failed to bulk delete reels:", err);
                alert("Failed to delete selected reels.");
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
            addToQueue(e.dataTransfer.files, 'reel');
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            addToQueue(e.target.files, 'reel');
        }
    };

    const handleEditClick = (reel) => {
        setEditingReel(reel);
        setEditTitle(reel.title);
        setEditDescription(reel.description || '');
        setEditStatus(reel.status);
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        axios.put(`/api/admin/reels/${editingReel.id}`, {
            title: editTitle,
            description: editDescription,
            status: editStatus
        })
        .then(res => {
            setEditingReel(null);
            loadReels(page);
        })
        .catch(err => console.error("Failed to update reel:", err));
    };

    const handleDeleteClick = (reelId) => {
        if (!confirm("Are you sure you want to delete this Reel permanently?")) return;

        axios.delete(`/api/admin/reels/${reelId}`)
            .then(() => {
                loadReels(page);
            })
            .catch(err => console.error("Failed to delete reel:", err));
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div>
            <h2 className="admin-panel-title">Manage Reels</h2>

            {/* Reel Upload Dropzone */}
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
                    borderColor: dragActive ? '#eb2f96' : 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '16px',
                    background: dragActive ? 'rgba(235, 47, 150, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
                onClick={() => document.getElementById('reel-input-file').click()}
            >
                <input 
                    id="reel-input-file"
                    type="file" 
                    multiple
                    accept="video/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📤</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
                    Drag & Drop Reel Files
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: '100%', padding: '0 0.5rem' }}>
                    or click to browse your files. Supports multiple file uploads. Filename will be used as the default reel title.
                </p>
                <button 
                    type="button" 
                    className="admin-btn admin-btn-primary"
                    style={{ pointerEvents: 'none', padding: '8px 20px', backgroundColor: '#eb2f96', borderColor: '#eb2f96' }}
                >
                    Select Reels
                </button>
            </div>

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
                        Selected <span style={{ color: '#eb2f96', fontSize: '1.1rem', fontWeight: '700' }}>{selectedIds.length}</span> {selectedIds.length === 1 ? 'reel' : 'reels'}
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

            {/* Reels Table Header with Select All */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '12px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', margin: 0 }}>All Reels</h3>
                {reels.length > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', userSelect: 'none' }}>
                        <input 
                            type="checkbox" 
                            checked={reels.length > 0 && selectedIds.length === reels.length}
                            onChange={handleSelectAll}
                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#eb2f96' }}
                        />
                        Select All
                    </label>
                )}
            </div>
            {loading && reels.length === 0 ? (
                <div className="spinner"></div>
            ) : reels.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No reels found. Upload your first reel above.
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={reels.length > 0 && selectedIds.length === reels.length}
                                        onChange={handleSelectAll}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#eb2f96' }}
                                    />
                                </th>
                                <th>Thumbnail</th>
                                <th>Title</th>
                                <th>Resolution</th>
                                <th>Duration</th>
                                <th>Views</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reels.map(reel => (
                                <tr key={reel.id} style={{ background: selectedIds.includes(reel.id) ? 'rgba(235, 47, 150, 0.03)' : '' }}>
                                    <td className="col-checkbox" style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.includes(reel.id)}
                                            onChange={() => handleCheckboxChange(reel.id)}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#eb2f96' }}
                                        />
                                    </td>
                                    <td className="col-thumbnail">
                                        <img src={reel.thumbnail_path} alt="" style={{ width: '50px', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' }} />
                                    </td>
                                    <td className="col-title">
                                        <div style={{ fontWeight: '600', color: '#fff' }}>{reel.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: reel.status === 'published' ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            {reel.status.toUpperCase()}
                                        </div>
                                    </td>
                                    <td className="col-badge">{reel.resolution || 'Pending'}</td>
                                    <td className="col-badge">{formatDuration(reel.duration)}</td>
                                    <td className="col-badge">{reel.views.toLocaleString()}</td>
                                    <td className="col-actions">
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => handleEditClick(reel)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Edit
                                            </button>
                                            <button onClick={() => handleDeleteClick(reel.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
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

            {/* Edit Reel Modal */}
            {editingReel && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h3 className="modal-title">Edit Reel Details</h3>
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

                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingReel(null)} className="admin-btn admin-btn-secondary">
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
