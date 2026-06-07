import React, { useState, useEffect } from 'react';
import { useUpload } from './UploadContext';

export default function UploadDashboard() {
    const {
        queue,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        retryUpload,
        clearCompleted
    } = useUpload();

    const [isExpanded, setIsExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (queue.length === 0) return null;

    const activeOrWaiting = queue.filter(item => item.status === 'uploading' || item.status === 'waiting');
    const completed = queue.filter(item => item.status === 'completed');
    const failed = queue.filter(item => item.status === 'failed');

    const totalItems = queue.length;
    const completedCount = completed.length;

    // Calculate overall progress
    let overallProgress = 0;
    if (totalItems > 0) {
        const totalProgressSum = queue.reduce((sum, item) => sum + item.progress, 0);
        overallProgress = Math.round(totalProgressSum / totalItems);
    }

    const formatSpeed = (bytesPerSec) => {
        if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
        if (bytesPerSec >= 1024 * 1024) {
            return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        }
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    };

    const formatETA = (seconds) => {
        if (seconds === undefined || seconds === null || seconds < 0) return '--';
        if (seconds === 0) return '0s';
        if (seconds >= 60) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}m ${secs}s`;
        }
        return `${seconds}s`;
    };

    const getStatusText = (item) => {
        switch (item.status) {
            case 'uploading':
                return `Uploading (${item.progress}%)`;
            case 'waiting':
                return 'Waiting in queue';
            case 'paused':
                return 'Paused';
            case 'failed':
                return `Failed: ${item.error || 'Server error'}`;
            case 'completed':
                return 'Complete';
            default:
                return item.status;
        }
    };

    return (
        <div className="upload-dashboard-container" style={{
            position: 'fixed',
            bottom: isMobile ? '64px' : '20px',
            right: isMobile ? '0' : '20px',
            left: isMobile ? '0' : 'auto',
            zIndex: 9999,
            width: isMobile ? '100%' : (isExpanded ? '420px' : '300px'),
            maxWidth: isMobile ? '100%' : 'calc(100vw - 40px)',
            background: 'rgba(23, 23, 23, 0.97)',
            backdropFilter: 'blur(20px)',
            borderRadius: isMobile ? '16px 16px 0 0' : '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderBottom: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: isMobile ? '0 -8px 30px rgba(0, 0, 0, 0.6)' : '0 20px 40px rgba(0, 0, 0, 0.5)',
            color: '#fff',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <style>{`
                @keyframes uploadSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .upload-spin-icon {
                    display: inline-block;
                    animation: uploadSpin 2s linear infinite;
                }
                .upload-dashboard-list::-webkit-scrollbar {
                    width: 6px;
                }
                .upload-dashboard-list::-webkit-scrollbar-track {
                    background: transparent;
                }
                .upload-dashboard-list::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 3px;
                }
            `}</style>

            {/* Header / Collapse Bar */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '14px 20px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {activeOrWaiting.length > 0 ? (
                            <span className="upload-spin-icon" style={{ fontSize: '1.2rem' }}>🔄</span>
                        ) : failed.length > 0 ? (
                            <span style={{ fontSize: '1.2rem', color: '#ff4d4f' }}>⚠️</span>
                        ) : (
                            <span style={{ fontSize: '1.2rem', color: '#52c41a' }}>✅</span>
                        )}
                    </div>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                        {activeOrWaiting.length > 0 ? (
                            `Uploading ${completedCount + 1}/${totalItems}`
                        ) : (
                            `Uploads finished (${completedCount}/${totalItems})`
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.85rem', background: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                        {overallProgress}%
                    </span>
                    <span style={{ fontSize: '0.8rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        ▼
                    </span>
                </div>
            </div>

            {/* Collapsed overall progress bar */}
            {!isExpanded && (
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)' }}>
                    <div style={{
                        width: `${overallProgress}%`,
                        height: '100%',
                        background: activeOrWaiting.length > 0 ? 'linear-gradient(90deg, #1890ff, #13c2c2)' : failed.length > 0 ? '#ff4d4f' : '#52c41a',
                        transition: 'width 0.3s ease'
                    }} />
                </div>
            )}

            {/* Expanded List Panel */}
            {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '50vh' : '400px' }}>
                    <div style={{
                        padding: '10px 20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.01)',
                        fontSize: '0.85rem',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                            {activeOrWaiting.length} active, {completedCount} complete
                        </span>
                        <button 
                            onClick={(e) => { e.stopPropagation(); clearCompleted(); }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#1890ff',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                transition: 'background 0.2s'
                            }}
                        >
                            Clear Finished
                        </button>
                    </div>

                    <div className="upload-dashboard-list" style={{ overflowY: 'auto', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {queue.map((item) => (
                            <div 
                                key={item.id} 
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                    <div style={{
                                        fontSize: '0.85rem',
                                        fontWeight: '500',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: isMobile ? '60vw' : '260px'
                                    }} title={item.filename}>
                                        {item.filename}
                                    </div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        textTransform: 'uppercase',
                                        fontWeight: 'bold',
                                        color: item.fileType === 'reel' ? '#eb2f96' : '#2f54eb',
                                        background: item.fileType === 'reel' ? 'rgba(235, 47, 150, 0.15)' : 'rgba(47, 84, 235, 0.15)',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        flexShrink: 0
                                    }}>
                                        {item.fileType}
                                    </span>
                                </div>

                                {/* Progress Bar & Status Text */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                        {getStatusText(item)}
                                    </span>
                                    {item.status === 'uploading' && (
                                        <span>{formatSpeed(item.speed)} • ETA: {formatETA(item.eta)}</span>
                                    )}
                                </div>

                                <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${item.progress}%`,
                                        height: '100%',
                                        background: item.status === 'completed' ? '#52c41a' : item.status === 'failed' ? '#ff4d4f' : item.status === 'paused' ? '#faad14' : '#1890ff',
                                        transition: 'width 0.2s ease'
                                    }} />
                                </div>

                                {/* Controls */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
                                    {item.status === 'uploading' && (
                                        <button 
                                            onClick={() => pauseUpload(item.id)}
                                            style={{
                                                background: 'rgba(250, 173, 20, 0.15)',
                                                border: 'none',
                                                color: '#faad14',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            Pause
                                        </button>
                                    )}
                                    {item.status === 'paused' && (
                                        <button 
                                            onClick={() => resumeUpload(item.id)}
                                            style={{
                                                background: 'rgba(82, 196, 26, 0.15)',
                                                border: 'none',
                                                color: '#52c41a',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            Resume
                                        </button>
                                    )}
                                    {item.status === 'failed' && (
                                        <button 
                                            onClick={() => retryUpload(item.id)}
                                            style={{
                                                background: 'rgba(24, 144, 255, 0.15)',
                                                border: 'none',
                                                color: '#1890ff',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            Retry
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => cancelUpload(item.id)}
                                        style={{
                                            background: 'rgba(255, 77, 79, 0.15)',
                                            border: 'none',
                                            color: '#ff4d4f',
                                            borderRadius: '6px',
                                            padding: '3px 10px',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        {item.status === 'completed' ? 'Remove' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
