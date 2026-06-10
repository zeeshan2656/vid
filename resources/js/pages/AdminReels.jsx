import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useUpload } from '../components/UploadContext';

export default function AdminReels() {
    const { addToQueue, lastCompletedUpload, setLastCompletedUpload } = useUpload();

    const [reels, setReels] = useState([]);
    const [pagination, setPagination] = useState({});
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Drag and drop state
    const [dragActive, setDragActive] = useState(false);

    // Edit modal states
    const [editingReel, setEditingReel]         = useState(null);
    const [editTitle, setEditTitle]             = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStatus, setEditStatus]           = useState('published');

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
        axios.get(`/api/admin/reels`, { params: { page: pageNum, per_page: 500 } })
            .then(res => {
                setReels(res.data.data);
                setPagination(res.data);
                setSelectedIds([]);
            })
            .catch(err => console.error('Error loading admin reels:', err))
            .finally(() => setLoading(false));
    };

    const handleCheckboxChange = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSelectAll = () => {
        setSelectedIds(selectedIds.length === reels.length ? [] : reels.map(r => r.id));
    };

    const handleBulkDelete = () => {
        if (!confirm(`Delete ${selectedIds.length} selected reel(s) and all their files permanently?`)) return;
        setLoading(true);
        axios.post('/api/admin/reels/bulk-delete', { ids: selectedIds })
            .then(() => { setSelectedIds([]); loadReels(page); })
            .catch(() => alert('Failed to delete selected reels.'))
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
        if (e.dataTransfer.files?.length) addToQueue(e.dataTransfer.files, 'reel');
    };

    const handleFileSelect = (e) => {
        if (e.target.files?.length) addToQueue(e.target.files, 'reel');
    };

    const handleEditClick = (reel) => {
        setEditingReel(reel);
        setEditTitle(reel.title || '');
        setEditDescription(reel.description || '');
        setEditStatus(reel.status);
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        axios.put(`/api/admin/reels/${editingReel.id}`, {
            title: editTitle,
            description: editDescription,
            status: editStatus,
        })
        .then(() => { setEditingReel(null); loadReels(page); })
        .catch(err => console.error('Failed to update reel:', err));
    };

    const handleDeleteClick = (id) => {
        if (!confirm('Delete this Reel permanently?')) return;
        axios.delete(`/api/admin/reels/${id}`)
            .then(() => loadReels(page))
            .catch(err => console.error('Failed to delete reel:', err));
    };

    const formatDuration = (secs) => {
        if (!secs) return '00:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div>
            <h2 className="admin-panel-title">Manage Reels</h2>

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
                    borderColor: dragActive ? '#eb2f96' : 'rgba(255,255,255,0.15)',
                    borderRadius: '16px',
                    background: dragActive ? 'rgba(235,47,150,0.05)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
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
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎬</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
                    Drag &amp; Drop Reel Files
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: 480 }}>
                    Or click to browse. Supports 1–100+ files at once. Title auto-fills from filename. No thumbnail required for reels.
                </p>
                <button type="button" className="admin-btn admin-btn-primary" style={{ pointerEvents: 'none', padding: '8px 20px', backgroundColor: '#eb2f96', borderColor: '#eb2f96' }}>
                    Select Reels
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
                        Selected <span style={{ color: '#eb2f96', fontSize: '1.1rem', fontWeight: 700 }}>{selectedIds.length}</span> {selectedIds.length === 1 ? 'reel' : 'reels'}
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

            {/* ── Reels Table Header ───────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: 12 }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: 0 }}>All Reels</h3>
                {reels.length > 0 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', userSelect: 'none' }}>
                        <input
                            type="checkbox"
                            checked={reels.length > 0 && selectedIds.length === reels.length}
                            onChange={handleSelectAll}
                            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#eb2f96' }}
                        />
                        Select All
                    </label>
                )}
            </div>

            {loading && reels.length === 0 ? (
                <div className="spinner" />
            ) : reels.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No reels found. Upload your first reel above.
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input type="checkbox" checked={reels.length > 0 && selectedIds.length === reels.length} onChange={handleSelectAll} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#eb2f96' }} />
                                </th>
                                <th>Title</th>
                                <th>Resolution</th>
                                <th>Orientation</th>
                                <th>Duration</th>
                                <th>Views</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reels.map(reel => (
                                <tr key={reel.id} style={{ background: selectedIds.includes(reel.id) ? 'rgba(235,47,150,0.03)' : '' }}>
                                    <td className="col-checkbox" style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={selectedIds.includes(reel.id)} onChange={() => handleCheckboxChange(reel.id)} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#eb2f96' }} />
                                    </td>
                                    <td className="col-title">
                                        <div style={{ fontWeight: 600, color: '#fff' }}>{reel.title}</div>
                                        {reel.description && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                                {reel.description}
                                            </div>
                                        )}
                                    </td>
                                    <td className="col-badge">{reel.resolution || 'Pending'}</td>
                                    <td className="col-badge">
                                        <span style={{
                                            padding: '2px 7px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                                            background: reel.orientation === 'portrait' ? 'rgba(235,47,150,0.1)' : 'rgba(64,150,255,0.1)',
                                            color: reel.orientation === 'portrait' ? '#eb2f96' : '#4096ff',
                                        }}>
                                            {reel.orientation || 'portrait'}
                                        </span>
                                    </td>
                                    <td className="col-badge">{formatDuration(reel.duration)}</td>
                                    <td className="col-badge">{reel.views.toLocaleString()}</td>
                                    <td className="col-badge">
                                        <span style={{
                                            padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 'bold',
                                            background: reel.status === 'published' ? 'rgba(235,47,150,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: reel.status === 'published' ? '#eb2f96' : 'var(--text-muted)',
                                        }}>
                                            {reel.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="col-actions">
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => handleEditClick(reel)} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Edit</button>
                                            <button onClick={() => handleDeleteClick(reel.id)} className="admin-btn admin-btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Delete</button>
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

            {/* ── Edit Reel Modal ──────────────────────────────────── */}
            {editingReel && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <h3 className="modal-title">Edit Reel Details</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group">
                                <label className="form-label">
                                    Title <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span>
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

                            <div className="modal-actions">
                                <button type="button" onClick={() => setEditingReel(null)} className="admin-btn admin-btn-secondary">Cancel</button>
                                <button type="submit" className="admin-btn admin-btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
