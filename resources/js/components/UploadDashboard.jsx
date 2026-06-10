import React, { useState, useEffect } from 'react';
import { useUpload } from './UploadContext';

// ── Format helpers ──────────────────────────────────────────────────────────
const formatSpeed = (bps) => {
    if (!bps || bps <= 0) return '—';
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bps / 1024).toFixed(1)} KB/s`;
};

const formatETA = (secs) => {
    if (secs == null || secs <= 0) return '—';
    if (secs >= 3600) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return `${h}h ${m}m`;
    }
    if (secs >= 60) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s}s`;
    }
    return `${secs}s`;
};

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576)    return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024)       return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
};

// ── Status helpers ─────────────────────────────────────────────────────────
const STATUS_META = {
    uploading:  { label: 'Uploading',   color: '#4096ff',  bg: 'rgba(64,150,255,0.12)',  icon: '⬆' },
    waiting:    { label: 'Waiting',     color: '#8c8c8c',  bg: 'rgba(140,140,140,0.10)', icon: '⏳' },
    processing: { label: 'Processing',  color: '#9254de',  bg: 'rgba(146,84,222,0.12)',  icon: '⚙' },
    completed:  { label: 'Published',   color: '#52c41a',  bg: 'rgba(82,196,26,0.12)',   icon: '✓' },
    failed:     { label: 'Failed',      color: '#ff4d4f',  bg: 'rgba(255,77,79,0.12)',   icon: '✕' },
    paused:     { label: 'Paused',      color: '#faad14',  bg: 'rgba(250,173,20,0.12)',  icon: '⏸' },
    cancelled:  { label: 'Cancelled',   color: '#595959',  bg: 'rgba(89,89,89,0.10)',    icon: '⊘' },
};

const getBarColor = (status) => {
    switch (status) {
        case 'uploading':  return 'linear-gradient(90deg, #4096ff, #00d4ff)';
        case 'processing': return 'linear-gradient(90deg, #9254de, #eb2f96)';
        case 'completed':  return '#52c41a';
        case 'failed':     return '#ff4d4f';
        case 'paused':     return '#faad14';
        case 'cancelled':  return '#595959';
        default:           return 'rgba(255,255,255,0.15)';
    }
};

// ── Animated spinner SVG ───────────────────────────────────────────────────
const Spinner = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'udSpin 1s linear infinite', flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 15" />
    </svg>
);

// ── Individual file row ────────────────────────────────────────────────────
const UploadRow = ({ item, isMobile, onPause, onResume, onCancel, onRetry, onRemove }) => {
    const meta = STATUS_META[item.status] || STATUS_META.waiting;
    const isActive = item.status === 'uploading' || item.status === 'processing';

    return (
        <div style={{
            padding: '11px 14px',
            borderRadius: '10px',
            background: meta.bg,
            border: `1px solid ${meta.color}22`,
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            transition: 'background 0.2s',
        }}>
            {/* Row 1: filename + type badge + status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {isActive && <span style={{ color: meta.color, flexShrink: 0, fontSize: '13px' }}><Spinner /></span>}
                {!isActive && (
                    <span style={{ color: meta.color, flexShrink: 0, fontSize: '13px', fontWeight: 700 }}>
                        {meta.icon}
                    </span>
                )}
                <span style={{
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    color: '#e8e8e8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                }} title={item.filename}>
                    {item.filename}
                </span>
                <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: item.fileType === 'reel' ? '#eb2f96' : '#4096ff',
                    background: item.fileType === 'reel' ? 'rgba(235,47,150,0.15)' : 'rgba(64,150,255,0.15)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                }}>
                    {item.fileType}
                </span>
                <span style={{
                    fontSize: '0.68rem',
                    color: meta.color,
                    background: meta.bg,
                    border: `1px solid ${meta.color}33`,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    fontWeight: 600,
                }}>
                    {meta.label}
                </span>
            </div>

            {/* Row 2: progress bar */}
            {(item.status !== 'cancelled' && item.status !== 'completed') && (
                <div style={{
                    height: '4px',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${item.progress || 0}%`,
                        height: '100%',
                        background: getBarColor(item.status),
                        transition: item.status === 'uploading' ? 'width 0.2s ease' : 'none',
                        borderRadius: '2px',
                    }} />
                </div>
            )}

            {/* Row 3: stats + controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.status === 'uploading' && (
                        <>
                            <span style={{ color: '#4096ff', fontWeight: 600 }}>{item.progress || 0}%</span>
                            <span>{formatBytes(item.uploadedBytes)} / {formatBytes(item.totalBytes)}</span>
                            <span style={{ color: '#52c41a' }}>{formatSpeed(item.speed)}</span>
                            <span>ETA {formatETA(item.eta)}</span>
                        </>
                    )}
                    {item.status === 'processing' && (
                        <span style={{ color: '#9254de' }}>Running FFmpeg…</span>
                    )}
                    {item.status === 'waiting' && (
                        <span>{formatBytes(item.totalBytes)} • In queue</span>
                    )}
                    {item.status === 'paused' && (
                        <span style={{ color: '#faad14' }}>{item.progress || 0}% paused • {formatBytes(item.totalBytes)}</span>
                    )}
                    {item.status === 'completed' && (
                        <span style={{ color: '#52c41a', fontWeight: 600 }}>✓ Published successfully</span>
                    )}
                    {item.status === 'failed' && (
                        <span style={{ color: '#ff4d4f' }}>{item.error || 'Upload failed'}</span>
                    )}
                    {item.status === 'cancelled' && (
                        <span>Upload cancelled</span>
                    )}
                </div>

                {/* Per-item controls */}
                <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    {item.status === 'uploading' && (
                        <Btn label="Pause" color="#faad14" onClick={() => onPause(item.id)} />
                    )}
                    {item.status === 'paused' && (
                        <Btn label="Resume" color="#52c41a" onClick={() => onResume(item.id)} />
                    )}
                    {item.status === 'failed' && (
                        <Btn label="Retry" color="#4096ff" onClick={() => onRetry(item.id)} />
                    )}
                    {['waiting', 'uploading', 'paused', 'failed'].includes(item.status) && (
                        <Btn label="Cancel" color="#ff4d4f" onClick={() => onCancel(item.id)} />
                    )}
                    {['completed', 'cancelled', 'failed'].includes(item.status) && (
                        <Btn label="✕" color="rgba(255,255,255,0.3)" onClick={() => onRemove(item.id)} title="Remove from list" />
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Tiny pill button ───────────────────────────────────────────────────────
const Btn = ({ label, color, onClick, title }) => (
    <button
        title={title}
        onClick={onClick}
        style={{
            background: 'none',
            border: `1px solid ${color}44`,
            color,
            borderRadius: '6px',
            padding: '2px 9px',
            fontSize: '0.72rem',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = `${color}18`}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
        {label}
    </button>
);

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function UploadDashboard() {
    const {
        queue,
        pauseUpload, resumeUpload, cancelUpload, retryUpload, removeFromQueue,
        pauseAll, resumeAll, cancelAll, clearCompleted,
    } = useUpload();

    const [isExpanded, setIsExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handle = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handle);
        return () => window.removeEventListener('resize', handle);
    }, []);

    if (queue.length === 0) return null;

    // ── Counters ───────────────────────────────────────────────────────
    const uploading   = queue.filter(i => i.status === 'uploading');
    const waiting     = queue.filter(i => i.status === 'waiting');
    const processing  = queue.filter(i => i.status === 'processing');
    const paused      = queue.filter(i => i.status === 'paused');
    const completed   = queue.filter(i => i.status === 'completed');
    const failed      = queue.filter(i => i.status === 'failed');
    const cancelled   = queue.filter(i => i.status === 'cancelled');

    const inProgress  = uploading.length + waiting.length + processing.length;
    const totalBytes  = queue.reduce((s, i) => s + (i.totalBytes || 0), 0);
    const uploadedBytes = queue.reduce((s, i) => s + (i.uploadedBytes || 0), 0);

    // Overall progress as fraction of total bytes
    const overallPct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

    // Active speed (from the currently uploading item)
    const activeItem   = uploading[0];
    const activeSpeed  = activeItem?.speed || 0;

    // Header text
    const getHeaderText = () => {
        if (uploading.length > 0)  return `Uploading ${uploading.length + waiting.length + processing.length} file(s)`;
        if (processing.length > 0) return `Processing ${processing.length} file(s)…`;
        if (paused.length > 0)     return `${paused.length} paused`;
        if (failed.length > 0)     return `${failed.length} failed`;
        if (completed.length > 0)  return `${completed.length} completed`;
        return 'Upload Queue';
    };

    // Header bar color
    const getHeaderColor = () => {
        if (uploading.length > 0 || processing.length > 0) return 'linear-gradient(90deg, #4096ff, #9254de)';
        if (failed.length > 0)   return '#ff4d4f';
        if (paused.length > 0)   return '#faad14';
        return '#52c41a';
    };

    // Bulk action availability
    const canPauseAll  = queue.some(i => i.status === 'uploading' || i.status === 'waiting');
    const canResumeAll = queue.some(i => i.status === 'paused');
    const canCancelAll = queue.some(i => ['uploading', 'waiting', 'paused'].includes(i.status));
    const canClear     = queue.some(i => ['completed', 'cancelled', 'failed'].includes(i.status));

    return (
        <>
            <style>{`
                @keyframes udSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                .ud-container *::-webkit-scrollbar { width: 4px; }
                .ud-container *::-webkit-scrollbar-track { background: transparent; }
                .ud-container *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
            `}</style>

            <div className="ud-container" style={{
                position: 'fixed',
                bottom: isMobile ? '64px' : '20px',
                right:  isMobile ? '0'    : '20px',
                left:   isMobile ? '0'    : 'auto',
                zIndex: 9999,
                width:  isMobile ? '100%' : (isExpanded ? '440px' : '320px'),
                maxWidth: isMobile ? '100%' : 'calc(100vw - 40px)',
                background: 'rgba(14,14,14,0.97)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRadius: isMobile ? '16px 16px 0 0' : '16px',
                border: '1px solid rgba(255,255,255,0.09)',
                borderBottom: isMobile ? 'none' : '1px solid rgba(255,255,255,0.09)',
                boxShadow: isMobile
                    ? '0 -10px 40px rgba(0,0,0,0.7)'
                    : '0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                overflow: 'hidden',
                transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}>

                {/* ── Header ────────────────────────────────────────── */}
                <div
                    onClick={() => setIsExpanded(e => !e)}
                    style={{
                        padding: '13px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}
                >
                    {/* Animated icon */}
                    <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '8px',
                        background: inProgress > 0 ? 'rgba(64,150,255,0.15)' : 'rgba(82,196,26,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: inProgress > 0 ? '#4096ff' : '#52c41a', fontSize: 14,
                    }}>
                        {(uploading.length > 0 || processing.length > 0) ? <Spinner /> : '✓'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.87rem', fontWeight: 600, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {getHeaderText()}
                        </div>
                        {!isExpanded && inProgress > 0 && (
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
                                {overallPct}% • {formatSpeed(activeSpeed)}
                            </div>
                        )}
                    </div>

                    {/* Queue size badge */}
                    <span style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '10px',
                        flexShrink: 0,
                    }}>
                        {queue.length}
                    </span>

                    <span style={{
                        fontSize: '10px',
                        color: 'rgba(255,255,255,0.35)',
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                    }}>▼</span>
                </div>

                {/* ── Thin progress bar (collapsed) ─────────────────── */}
                {!isExpanded && (
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{
                            width: `${overallPct}%`,
                            height: '100%',
                            background: getHeaderColor(),
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                )}

                {/* ── Expanded panel ────────────────────────────────── */}
                {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '55vh' : '420px' }}>

                        {/* Stats bar */}
                        <div style={{
                            padding: '8px 16px',
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                            fontSize: '0.72rem',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            background: 'rgba(255,255,255,0.01)',
                        }}>
                            {uploading.length > 0   && <StatChip n={uploading.length}  label="Uploading" color="#4096ff" />}
                            {waiting.length > 0     && <StatChip n={waiting.length}    label="Waiting"   color="#8c8c8c" />}
                            {processing.length > 0  && <StatChip n={processing.length} label="Processing" color="#9254de" />}
                            {paused.length > 0      && <StatChip n={paused.length}     label="Paused"    color="#faad14" />}
                            {completed.length > 0   && <StatChip n={completed.length}  label="Done"      color="#52c41a" />}
                            {failed.length > 0      && <StatChip n={failed.length}     label="Failed"    color="#ff4d4f" />}
                            {cancelled.length > 0   && <StatChip n={cancelled.length}  label="Cancelled" color="#595959" />}
                        </div>

                        {/* Bulk actions */}
                        <div style={{
                            padding: '8px 16px',
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}>
                            {canPauseAll  && <BulkBtn label="⏸ Pause All"    color="#faad14" onClick={pauseAll} />}
                            {canResumeAll && <BulkBtn label="▶ Resume All"   color="#52c41a" onClick={resumeAll} />}
                            {canCancelAll && <BulkBtn label="⊘ Cancel All"   color="#ff4d4f" onClick={cancelAll} />}
                            {canClear     && <BulkBtn label="✕ Clear Done"   color="#8c8c8c" onClick={clearCompleted} />}
                        </div>

                        {/* File list */}
                        <div style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {queue.map(item => (
                                <UploadRow
                                    key={item.id}
                                    item={item}
                                    isMobile={isMobile}
                                    onPause={pauseUpload}
                                    onResume={resumeUpload}
                                    onCancel={cancelUpload}
                                    onRetry={retryUpload}
                                    onRemove={removeFromQueue}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ── Tiny stat chip ─────────────────────────────────────────────────────────
const StatChip = ({ n, label, color }) => (
    <span style={{ color, fontWeight: 600 }}>
        {n} <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>{label}</span>
    </span>
);

// ── Bulk action button ─────────────────────────────────────────────────────
const BulkBtn = ({ label, color, onClick }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{
            background: `${color}14`,
            border: `1px solid ${color}33`,
            color,
            borderRadius: '6px',
            padding: '4px 11px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = `${color}28`}
        onMouseLeave={e => e.currentTarget.style.background = `${color}14`}
    >
        {label}
    </button>
);
