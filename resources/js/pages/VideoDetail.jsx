import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import AdRenderer from '../components/AdRenderer';

/* ─────────────────────────────────────────────────────────────
   Helper: format seconds → mm:ss or hh:mm:ss
──────────────────────────────────────────────────────────────*/
function fmtTime(sec) {
    if (!isFinite(sec) || isNaN(sec)) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const getDeviceType = () => window.innerWidth <= 768 ? 'mobile' : 'desktop';

/* ─────────────────────────────────────────────────────────────
   Custom YouTube-like Video Player
──────────────────────────────────────────────────────────────*/
const YouTubePlayer = memo(function YouTubePlayer({
    src,
    poster,
    onPlay,
    onTimeUpdate,
    videoRef,
    isOverlayActive,
    onSkipBack,
    onSkipForward,
    showBackwardRipple,
    showForwardRipple,
}) {
    const containerRef = useRef(null);
    const progressRef = useRef(null);
    const hideControlsTimerRef = useRef(null);
    const volumeBeforeMuteRef = useRef(1);
    const clickTimeoutRef = useRef(null);

    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isHoveringProgress, setIsHoveringProgress] = useState(false);
    const [hoverTime, setHoverTime] = useState(0);
    const [hoverX, setHoverX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);

    /* Auto-hide controls */
    const resetHideTimer = useCallback(() => {
        if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        setShowControls(true);
        hideControlsTimerRef.current = setTimeout(() => {
            if (playing && !isHoveringProgress && !isOverlayActive) {
                setShowControls(false);
            }
        }, 3000);
    }, [playing, isHoveringProgress, isOverlayActive]);

    useEffect(() => {
        resetHideTimer();
    }, [playing]);

    /* Keyboard shortcuts */
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onKey = (e) => {
            if (isOverlayActive) return;
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    onSkipBack();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onSkipForward();
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                default: break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOverlayActive, onSkipBack, onSkipForward]);

    /* Fullscreen change listener */
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(
                !!(document.fullscreenElement ||
                   document.webkitFullscreenElement ||
                   document.mozFullScreenElement)
            );
        };
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
        document.addEventListener('mozfullscreenchange', handler);
        return () => {
            document.removeEventListener('fullscreenchange', handler);
            document.removeEventListener('webkitfullscreenchange', handler);
            document.removeEventListener('mozfullscreenchange', handler);
        };
    }, []);

    const togglePlay = useCallback(() => {
        if (!videoRef.current || isOverlayActive) return;
        if (videoRef.current.paused) {
            videoRef.current.play().catch(console.error);
        } else {
            videoRef.current.pause();
        }
    }, [isOverlayActive, videoRef]);

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        if (muted) {
            videoRef.current.muted = false;
            videoRef.current.volume = volumeBeforeMuteRef.current || 0.5;
            setVolume(volumeBeforeMuteRef.current || 0.5);
            setMuted(false);
        } else {
            volumeBeforeMuteRef.current = videoRef.current.volume;
            videoRef.current.muted = true;
            setMuted(true);
        }
    }, [muted, videoRef]);

    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        if (!isFullscreen) {
            (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen).call(el);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
        }
    }, [isFullscreen]);

    /* Progress bar interaction */
    const seekToPosition = useCallback((clientX) => {
        if (!progressRef.current || !videoRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = ratio * (videoRef.current.duration || 0);
        if (isFinite(newTime)) videoRef.current.currentTime = newTime;
    }, [videoRef]);

    const onProgressMouseDown = (e) => {
        e.preventDefault();
        setIsDragging(true);
        seekToPosition(e.clientX);
    };
    const onProgressMouseMove = (e) => {
        if (!progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHoverX(e.clientX - rect.left);
        setHoverTime(ratio * (duration || 0));
        if (isDragging) seekToPosition(e.clientX);
    };
    const onProgressMouseUp = (e) => {
        if (isDragging) {
            seekToPosition(e.clientX);
            setIsDragging(false);
        }
    };

    useEffect(() => {
        if (isDragging) {
            const up = (e) => { seekToPosition(e.clientX); setIsDragging(false); };
            const move = (e) => { if (isDragging) seekToPosition(e.clientX); };
            window.addEventListener('mouseup', up);
            window.addEventListener('mousemove', move);
            return () => {
                window.removeEventListener('mouseup', up);
                window.removeEventListener('mousemove', move);
            };
        }
    }, [isDragging, seekToPosition]);

    /* Volume change */
    const handleVolumeChange = (e) => {
        const val = parseFloat(e.target.value);
        if (!videoRef.current) return;
        videoRef.current.volume = val;
        videoRef.current.muted = val === 0;
        setVolume(val);
        setMuted(val === 0);
        if (val > 0) volumeBeforeMuteRef.current = val;
    };

    /* Click on player: single = play/pause, double = skip */
    const handleContainerClick = (e) => {
        if (isOverlayActive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;

        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
            if (clickX < width / 2) onSkipBack();
            else onSkipForward();
        } else {
            clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                togglePlay();
            }, 220);
        }
    };

    /* Video events */
    const onVideoPlay = () => { setPlaying(true); if (onPlay) onPlay(); };
    const onVideoPause = () => setPlaying(false);
    const onVideoTimeUpdate = () => {
        if (!videoRef.current) return;
        setCurrentTime(videoRef.current.currentTime);
        // Buffered
        const buf = videoRef.current.buffered;
        if (buf && buf.length > 0) {
            const dur = videoRef.current.duration || 1;
            setBuffered((buf.end(buf.length - 1) / dur) * 100);
        }
        if (onTimeUpdate) onTimeUpdate();
    };
    const onVideoLoadedMetadata = () => {
        if (videoRef.current) setDuration(videoRef.current.duration || 0);
    };
    const onVideoWaiting = () => setIsBuffering(true);
    const onVideoCanPlay = () => setIsBuffering(false);

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    const volIcon = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                background: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                width: '100%',
                aspectRatio: '16/9',
                cursor: showControls || !playing ? 'default' : 'none',
                userSelect: 'none',
            }}
            onMouseMove={() => resetHideTimer()}
            onMouseLeave={() => { if (playing) setShowControls(false); }}
        >
            {/* VIDEO ELEMENT */}
            <video
                ref={videoRef}
                src={src}
                poster={poster}
                preload="metadata"
                playsInline
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
                onPlay={onVideoPlay}
                onPause={onVideoPause}
                onTimeUpdate={onVideoTimeUpdate}
                onLoadedMetadata={onVideoLoadedMetadata}
                onWaiting={onVideoWaiting}
                onCanPlay={onVideoCanPlay}
            />

            {/* BUFFERING SPINNER */}
            {isBuffering && !isOverlayActive && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)',
                    width: '56px', height: '56px',
                    border: '4px solid rgba(255,255,255,0.15)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    pointerEvents: 'none',
                    zIndex: 9,
                }} />
            )}

            {/* CLICK AREA (play/pause & double-click skip) — only when no overlay */}
            {!isOverlayActive && (
                <div
                    onClick={handleContainerClick}
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        bottom: '56px',   /* leave controls bar */
                        zIndex: 8,
                        cursor: 'pointer',
                    }}
                />
            )}

            {/* SKIP RIPPLE — Backward */}
            {showBackwardRipple && (
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px',
                    pointerEvents: 'none',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 12, animation: 'fadeInOut 0.6s ease',
                }}>
                    <div style={{ fontSize: '2.2rem', marginBottom: '6px' }}>⏪</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', textShadow: '0 2px 8px #000' }}>-10 seconds</div>
                </div>
            )}

            {/* SKIP RIPPLE — Forward */}
            {showForwardRipple && (
                <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    borderTopRightRadius: '12px', borderBottomRightRadius: '12px',
                    pointerEvents: 'none',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 12, animation: 'fadeInOut 0.6s ease',
                }}>
                    <div style={{ fontSize: '2.2rem', marginBottom: '6px' }}>⏩</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', textShadow: '0 2px 8px #000' }}>+10 seconds</div>
                </div>
            )}

            {/* LARGE PLAY ICON (center) when paused */}
            {!playing && !isOverlayActive && (
                <div
                    onClick={togglePlay}
                    style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        width: '72px', height: '72px',
                        background: 'rgba(0,0,0,0.65)',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 10,
                        backdropFilter: 'blur(4px)',
                        border: '2px solid rgba(255,255,255,0.2)',
                        transition: 'transform 0.15s ease, background 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translate(-50%,-50%) scale(1)'; }}
                >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </div>
            )}

            {/* ── CUSTOM CONTROLS BAR ── */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                zIndex: 15,
                opacity: showControls || !playing || isOverlayActive ? 1 : 0,
                transition: 'opacity 0.25s ease',
                pointerEvents: showControls || !playing ? 'all' : 'none',
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                padding: '0 0 0 0',
            }}>
                {/* PROGRESS BAR */}
                <div
                    ref={progressRef}
                    onMouseEnter={() => setIsHoveringProgress(true)}
                    onMouseLeave={() => { setIsHoveringProgress(false); if (!isDragging) {} }}
                    onMouseDown={onProgressMouseDown}
                    onMouseMove={onProgressMouseMove}
                    onMouseUp={onProgressMouseUp}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: isHoveringProgress || isDragging ? '6px' : '4px',
                        background: 'rgba(255,255,255,0.25)',
                        cursor: 'pointer',
                        transition: 'height 0.15s ease',
                        marginBottom: '0',
                    }}
                >
                    {/* Buffered */}
                    <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${buffered}%`,
                        background: 'rgba(255,255,255,0.35)',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                    }} />
                    {/* Progress */}
                    <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #bc00dd, #00f3ff)',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                        transition: isDragging ? 'none' : 'width 0.1s linear',
                    }} />
                    {/* Thumb */}
                    <div style={{
                        position: 'absolute',
                        left: `${progressPct}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: isHoveringProgress || isDragging ? '14px' : '0px',
                        height: isHoveringProgress || isDragging ? '14px' : '0px',
                        background: '#fff',
                        borderRadius: '50%',
                        boxShadow: '0 0 8px rgba(0,243,255,0.6)',
                        transition: 'width 0.15s ease, height 0.15s ease',
                        pointerEvents: 'none',
                    }} />

                    {/* Hover time tooltip */}
                    {isHoveringProgress && (
                        <div style={{
                            position: 'absolute',
                            bottom: '16px',
                            left: `${hoverX}px`,
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.85)',
                            color: '#fff',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            fontSize: '0.78rem',
                            fontWeight: '600',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                        }}>
                            {fmtTime(hoverTime)}
                        </div>
                    )}
                </div>

                {/* CONTROLS ROW */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px 10px 12px',
                }}>
                    {/* Play / Pause */}
                    <button
                        onClick={togglePlay}
                        style={ctrlBtn}
                        title={playing ? 'Pause (k)' : 'Play (k)'}
                    >
                        {playing ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        )}
                    </button>

                    {/* Skip Back 10s */}
                    <button
                        onClick={() => onSkipBack()}
                        style={ctrlBtn}
                        title="Rewind 10s (←)"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                            <text x="8.5" y="15.5" fontSize="6" fill="white" fontWeight="bold">10</text>
                        </svg>
                    </button>

                    {/* Skip Forward 10s */}
                    <button
                        onClick={() => onSkipForward()}
                        style={ctrlBtn}
                        title="Forward 10s (→)"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                            <text x="8.5" y="15.5" fontSize="6" fill="white" fontWeight="bold">10</text>
                        </svg>
                    </button>

                    {/* Volume */}
                    <div
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onMouseEnter={() => setShowVolumeSlider(true)}
                        onMouseLeave={() => setShowVolumeSlider(false)}
                    >
                        <button onClick={toggleMute} style={ctrlBtn} title="Mute (m)">
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{volIcon}</span>
                        </button>
                        <div style={{
                            overflow: 'hidden',
                            width: showVolumeSlider ? '80px' : '0px',
                            transition: 'width 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                        }}>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={muted ? 0 : volume}
                                onChange={handleVolumeChange}
                                style={{
                                    width: '80px',
                                    height: '4px',
                                    accentColor: '#00f3ff',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>
                    </div>

                    {/* Time display */}
                    <span style={{
                        color: '#e8e8f0',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        fontVariantNumeric: 'tabular-nums',
                        marginLeft: '4px',
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                    }}>
                        {fmtTime(currentTime)} / {fmtTime(duration)}
                    </span>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Fullscreen */}
                    <button
                        onClick={toggleFullscreen}
                        style={ctrlBtn}
                        title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
                    >
                        {isFullscreen ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
});

const ctrlBtn = {
    background: 'none',
    border: 'none',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    color: '#fff',
    transition: 'background 0.15s ease',
};

/* ─────────────────────────────────────────────────────────────
   Main VideoDetail Page
──────────────────────────────────────────────────────────────*/
const VideoDetail = memo(function VideoDetail() {
    const { id } = useParams();
    const [video, setVideo] = useState(null);
    const [comments, setComments] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [ads, setAds] = useState({});
    const [username, setUsername] = useState('');
    const [content, setContent] = useState('');
    const [commentStatus, setCommentStatus] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const videoRef = useRef(null);
    const viewLoggedRef = useRef(false);
    const overlayAdContainerRef = useRef(null);

    // Ad states
    const [isOverlayActive, setIsOverlayActive] = useState(false);
    const [overlayAd, setOverlayAd] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const [showSkip, setShowSkip] = useState(false);
    const lastAdTriggeredIntervalRef = useRef(0);

    // Skip ripple states
    const [showBackwardRipple, setShowBackwardRipple] = useState(false);
    const [showForwardRipple, setShowForwardRipple] = useState(false);

    // Mobile detection & collapsible comments
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
    const [commentsOpen, setCommentsOpen] = useState(false);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const trackAdImpression = useCallback((adId) => {
        if (!adId) return;
        axios.post(`/api/ads/${adId}/impression`).catch(err => console.error('Failed to track ad impression', err));
    }, []);

    const trackAdClick = useCallback((ad) => {
        if (!ad) return;
        axios.post(`/api/ads/${ad.id}/click`).catch(err => console.error('Failed to track ad click', err));
        if (ad.redirect_url) window.open(ad.redirect_url, '_blank', 'noopener,noreferrer');
    }, []);

    useEffect(() => {
        setVideo(null);
        setComments([]);
        setRecommendations([]);
        setCommentStatus('');
        setErrorMsg('');
        viewLoggedRef.current = false;
        setIsOverlayActive(false);
        setOverlayAd(null);
        lastAdTriggeredIntervalRef.current = 0;

        const device = getDeviceType();
        axios.get(`/api/videos/${id}?device=${device}`)
            .then(res => {
                // Rewrite video_path to use streaming endpoint (supports HTTP Range requests for seeking)
                const videoData = { ...res.data.video };
                if (videoData.video_path) {
                    const storagePrefix = '/storage/videos/';
                    const idx = videoData.video_path.indexOf(storagePrefix);
                    if (idx !== -1) {
                        const filename = videoData.video_path.substring(idx + storagePrefix.length);
                        videoData.video_path = '/api/stream/videos/' + filename;
                    }
                }
                setVideo(videoData);
                setComments(res.data.comments || []);
                setRecommendations(res.data.recommendations || []);
                setAds(res.data.ads || {});

                const overlay = res.data.ads?.video_player_overlay;
                if (overlay) {
                    setOverlayAd(overlay);
                    setIsOverlayActive(true);
                    setCountdown(overlay.ad_duration || 5);
                    setShowSkip(false);
                    trackAdImpression(overlay.id);
                }

                if (res.data.ads?.recommended_videos_banner) trackAdImpression(res.data.ads.recommended_videos_banner.id);
                if (res.data.ads?.video_above_comments) trackAdImpression(res.data.ads.video_above_comments.id);
            })
            .catch(err => {
                console.error('Error loading video details:', err);
                setErrorMsg('Video not found or failed to load.');
            });
    }, [id]);

    // Overlay ad countdown
    useEffect(() => {
        if (!isOverlayActive || countdown <= 0) {
            if (isOverlayActive && countdown === 0) setShowSkip(true);
            return;
        }
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(timer); setShowSkip(true); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isOverlayActive, countdown]);

    const handleTimeUpdate = useCallback(() => {
        if (!videoRef.current || isOverlayActive || !ads.video_player_overlay) return;
        const nextAdInterval = Math.floor(videoRef.current.currentTime / 60);
        if (nextAdInterval > lastAdTriggeredIntervalRef.current) {
            lastAdTriggeredIntervalRef.current = nextAdInterval;
            videoRef.current.pause();
            setCountdown(ads.video_player_overlay.ad_duration || 5);
            setShowSkip(false);
            setIsOverlayActive(true);
            trackAdImpression(ads.video_player_overlay.id);
        } else if (nextAdInterval < lastAdTriggeredIntervalRef.current) {
            lastAdTriggeredIntervalRef.current = nextAdInterval;
        }
    }, [isOverlayActive, ads.video_player_overlay, trackAdImpression]);

    const handleSkipAd = useCallback(() => {
        setIsOverlayActive(false);
        if (videoRef.current) videoRef.current.play().catch(console.error);
    }, []);

    const reloadAdvertisement = useCallback(() => {
        if (!overlayAd || (!overlayAd.ad_code && overlayAd.type !== 'native') || !overlayAdContainerRef.current) return;

        const container = overlayAdContainerRef.current;

        // Step 1: Completely clear the advertisement container
        container.innerHTML = '';

        // Extract ad code
        const adCode = overlayAd.ad_code || '';

        // Step 3: Recreate the advertisement container
        // Create a new isolated iframe element
        const iframe = document.createElement('iframe');
        iframe.style.width = '300px';
        iframe.style.height = '250px';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.style.background = 'transparent';
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('frameborder', '0');
        iframe.id = `overlay-ad-iframe-${Date.now()}`;

        container.appendChild(iframe);

        // Step 4 & 5: Write the advertisement code into the iframe document to force clean execution
        const iframeDoc = iframe.contentWindow || iframe.contentDocument;
        const doc = iframeDoc.document || iframeDoc;

        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                        background: transparent;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                </style>
            </head>
            <body>
                ${adCode}
            </body>
            </html>
        `);
        doc.close();
    }, [overlayAd]);

    // Whenever overlay state changes to visible (isOverlayActive === true), reload advertisement
    useEffect(() => {
        if (isOverlayActive && overlayAd && (overlayAd.type === 'native' || overlayAd.ad_code)) {
            // Wait a brief tick to allow the ref container to mount in DOM
            const timer = setTimeout(() => {
                reloadAdvertisement();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOverlayActive, overlayAd, reloadAdvertisement]);

    const showIndicator = (type) => {
        if (type === 'backward') {
            setShowBackwardRipple(true);
            setTimeout(() => setShowBackwardRipple(false), 600);
        } else {
            setShowForwardRipple(true);
            setTimeout(() => setShowForwardRipple(false), 600);
        }
    };

    const handleBackward10s = useCallback(() => {
        const vid = videoRef.current;
        if (!vid) return;
        vid.currentTime = Math.max(0, vid.currentTime - 10);
        showIndicator('backward');
    }, []);

    const handleForward10s = useCallback(() => {
        const vid = videoRef.current;
        if (!vid) return;
        const dur = vid.duration;
        const target = vid.currentTime + 10;
        if (isFinite(dur) && dur > 0) {
            vid.currentTime = Math.min(target, dur - 0.1);
        } else {
            vid.currentTime = target;
        }
        showIndicator('forward');
    }, []);

    const handlePlay = useCallback(() => {
        if (viewLoggedRef.current) return;
        setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused && !viewLoggedRef.current) {
                viewLoggedRef.current = true;
                axios.post(`/api/videos/${id}/view`)
                    .then(() => setVideo(prev => prev ? { ...prev, views: prev.views + 1 } : null))
                    .catch(console.error);
            }
        }, 3000);
    }, [id]);

    const handleCommentSubmit = useCallback((e) => {
        e.preventDefault();
        if (!content.trim()) return;
        setCommentStatus('submitting');
        setErrorMsg('');
        axios.post('/api/comments', {
            video_id: id,
            username: username.trim() || 'Anonymous',
            content: content.trim()
        }).then(res => {
            setComments(prev => [res.data.comment, ...prev]);
            setContent('');
            setCommentStatus('success');
            setTimeout(() => setCommentStatus(''), 3000);
        }).catch(err => {
            setCommentStatus('error');
            if (err.response?.status === 429)
                setErrorMsg("You're posting too fast. Please wait a minute before commenting again.");
            else
                setErrorMsg('Failed to post comment. Please try again.');
        });
    }, [id, username, content]);

    if (errorMsg && !video) {
        return (
            <main className="main-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '400px' }}>
                    <h2 style={{ color: '#ff4d4d', marginBottom: '1rem' }}>Error</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{errorMsg}</p>
                    <Link to="/" className="btn-submit" style={{ textDecoration: 'none' }}>Go Back Home</Link>
                </div>
            </main>
        );
    }

    if (!video) {
        return (
            <div style={{ display: 'flex', height: '80vh', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    /* ── Shared overlay ad render ── */
    const overlayAdRender = isOverlayActive && overlayAd && (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#000000e6',
            zIndex: 20,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            color: '#fff',
            borderRadius: isMobile ? '0' : '12px',
            overflow: 'hidden',
        }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {overlayAd.type === 'native' || overlayAd.ad_code ? (
                    <div 
                        ref={overlayAdContainerRef} 
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} 
                    />
                ) : overlayAd.media_type === 'video' ? (
                    <video
                        src={overlayAd.image_path}
                        autoPlay muted playsInline loop
                        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => trackAdClick(overlayAd)}
                    />
                ) : (
                    <img
                        src={overlayAd.image_path}
                        alt={overlayAd.title}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => trackAdClick(overlayAd)}
                    />
                )}

                {/* Skip / Countdown */}
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 25, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {showSkip ? (
                        <button
                            onClick={handleSkipAd}
                            style={{
                                background: 'rgba(0,0,0,0.8)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.3)',
                                padding: '8px 16px', borderRadius: '4px',
                                cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600',
                            }}
                        >Skip Ad ×</button>
                    ) : (
                        <span style={{
                            background: 'rgba(0,0,0,0.8)', color: '#ccc',
                            padding: '8px 16px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '500',
                        }}>Skip in {countdown}s</span>
                    )}
                </div>

                {/* Sponsored label */}
                <div style={{
                    position: 'absolute', bottom: '16px', left: '16px',
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    padding: '4px 8px', borderRadius: '4px',
                    fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px',
                }}>Sponsored Ad</div>
            </div>
        </div>
    );

    /* ── Shared video player ── */
    const videoPlayerBlock = (
        <div className="video-player-wrapper" style={{ position: 'relative', borderRadius: isMobile ? '0' : '12px', overflow: 'hidden' }}>
            <YouTubePlayer
                src={video.video_path}
                poster={video.thumbnail_path}
                onPlay={handlePlay}
                onTimeUpdate={handleTimeUpdate}
                videoRef={videoRef}
                isOverlayActive={isOverlayActive}
                onSkipBack={handleBackward10s}
                onSkipForward={handleForward10s}
                showBackwardRipple={showBackwardRipple}
                showForwardRipple={showForwardRipple}
            />
            {overlayAdRender}
        </div>
    );

    /* ── Ad banner helper ── */
    const renderAdBanner = useCallback((ad, extraStyle) => {
        if (!ad) return null;
        return (
            <div className="ad-banner" style={extraStyle}>
                {ad.image_path ? (
                    <a
                        href={ad.redirect_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackAdClick(ad)}
                        style={{ display: 'block', width: '100%' }}
                    >
                        {ad.media_type === 'video' ? (
                            <video src={ad.image_path} autoPlay muted loop playsInline
                                style={{ width: '100%', borderRadius: isMobile ? '0' : '12px', display: 'block' }} />
                        ) : (
                            <img src={ad.image_path} alt={ad.title}
                                style={{ width: '100%', borderRadius: isMobile ? '0' : '12px', display: 'block' }} loading="lazy" />
                        )}
                    </a>
                ) : (
                    <AdRenderer adCode={ad.ad_code} />
                )}
            </div>
        );
    }, [isMobile, trackAdClick]);

    /* ── Comments block (shared) ── */
    const commentsBlock = (
        <>
            {errorMsg && (
                <div className="notice-banner" style={{ background: 'rgba(220, 53, 69, 0.1)', borderColor: 'rgba(220, 53, 69, 0.3)', color: '#ff8080', margin: isMobile ? '0' : undefined, borderRadius: isMobile ? '0' : undefined, padding: isMobile ? '12px 14px' : undefined }}>
                    ⚠️ {errorMsg}
                </div>
            )}

            <form onSubmit={handleCommentSubmit} className="comment-form glass-panel" style={{ padding: '1.5rem' }}>
                <div className="comment-input-row">
                    <input
                        type="text"
                        className="comment-input comment-input-name"
                        placeholder="Your Name (optional)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={50}
                        disabled={commentStatus === 'submitting'}
                    />
                    <textarea
                        className="comment-input comment-textarea"
                        placeholder="Add a public comment..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        maxLength={1000}
                        required
                        disabled={commentStatus === 'submitting'}
                    />
                </div>
                <button
                    type="submit"
                    className="btn-submit"
                    disabled={commentStatus === 'submitting' || !content.trim()}
                >
                    {commentStatus === 'submitting' ? 'Posting...' : 'Comment'}
                </button>
            </form>

            <div className="comments-list">
                {comments.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                        No comments yet. Be the first to express your thoughts!
                    </div>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="comment-item glass-panel">
                            <div className="comment-header">
                                <span className="comment-author">{comment.username}</span>
                                <span className="comment-date">{new Date(comment.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="comment-text">{comment.content}</p>
                        </div>
                    ))
                )}
            </div>
        </>
    );

    /* ── Recommended videos ── */
    const recsBlock = (
        <>
            {recommendations.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: isMobile ? '12px 14px' : undefined }}>No recommendations available.</div>
            ) : (
                recommendations.map(rec => (
                    <Link
                        to={`/video/${rec.id}`}
                        key={rec.id}
                        className={isMobile ? 'mobile-rec-item' : 'glass-panel'}
                        style={isMobile ? {} : { display: 'flex', gap: '12px', padding: '8px', textDecoration: 'none', overflow: 'hidden' }}
                    >
                        <div style={{ width: '120px', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: '#000' }}>
                            <img src={rec.thumbnail_path} alt={rec.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                                {rec.title}
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {rec.views.toLocaleString()} views
                            </span>
                        </div>
                    </Link>
                ))
            )}
        </>
    );

    /* ════════════════════════════════════════════════════════
       MOBILE LAYOUT — full-width, sticky player, collapsed comments
    ════════════════════════════════════════════════════════ */
    if (isMobile) {
        return (
            <main className="main-content mobile-video-page">
                <div className="player-layout">
                    <div>
                        {/* Sticky video player */}
                        <div className="video-player-sticky">
                            {videoPlayerBlock}
                        </div>

                        {/* Bottom Video Ad */}
                        {renderAdBanner(ads.video_bottom)}

                        {/* Video Info */}
                        <div className="video-info-box">
                            <h1 className="video-title">{video.title}</h1>
                            <div className="video-stats">
                                <span>👁️ {video.views.toLocaleString()} views</span>
                                <span>📅 {new Date(video.published_at).toLocaleDateString()}</span>
                                <span>⏱️ {video.resolution}</span>
                            </div>
                            {video.description && (
                                <p className="video-description">{video.description}</p>
                            )}
                        </div>

                        {/* Above Comments Ad */}
                        {renderAdBanner(ads.video_above_comments)}

                        {/* Comments — Collapsed by default */}
                        <div className="comments-container">
                            <button
                                className="comments-toggle-btn"
                                onClick={() => setCommentsOpen(prev => !prev)}
                            >
                                <span>💬 Comments ({comments.length})</span>
                                <span className={`toggle-arrow ${commentsOpen ? 'open' : ''}`}>▼</span>
                            </button>
                            <div className={`comments-panel ${commentsOpen ? 'open' : ''}`}>
                                {commentsBlock}
                            </div>
                        </div>

                        {/* Sidebar Ad (shown below comments on mobile) */}
                        {renderAdBanner(ads.video_sidebar)}

                        {/* Recommended Videos Banner Ad */}
                        {renderAdBanner(ads.recommended_videos_banner)}

                        {/* Recommended Videos */}
                        <h2 className="mobile-section-header">Recommended Videos</h2>
                        <div className="mobile-rec-list">
                            {recsBlock}
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    /* ════════════════════════════════════════════════════════
       DESKTOP LAYOUT — original two-column grid
    ════════════════════════════════════════════════════════ */
    return (
        <main className="main-content">
            <div className="player-layout">
                {/* ── LEFT: Player + Info + Comments ── */}
                <div>
                    {videoPlayerBlock}

                    {/* Bottom Video Ad */}
                    {renderAdBanner(ads.video_bottom)}

                    {/* Video Info Box */}
                    <div className="video-info-box glass-panel">
                        <h1 className="video-title">{video.title}</h1>
                        <div className="video-stats">
                            <span>👁️ {video.views.toLocaleString()} views</span>
                            <span>📅 Published: {new Date(video.published_at).toLocaleDateString()}</span>
                            <span>⏱️ {video.resolution}</span>
                        </div>
                        <p className="video-description">{video.description || 'No description provided.'}</p>
                    </div>

                    {/* Above Comments Ad */}
                    {renderAdBanner(ads.video_above_comments, { margin: '2rem 0' })}

                    {/* Comments Section */}
                    <div className="comments-container">
                        <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-white)' }}>
                            Comments ({comments.length})
                        </h2>
                        {commentsBlock}
                    </div>
                </div>

                {/* ── RIGHT: Sidebar ── */}
                <div>
                    {renderAdBanner(ads.video_sidebar, { margin: '0 0 1.5rem 0' })}
                    {renderAdBanner(ads.recommended_videos_banner, { margin: '0 0 1.5rem 0', width: '100%' })}

                    <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-white)' }}>
                        Recommended Videos
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {recsBlock}
                    </div>
                </div>
            </div>
        </main>
    );
});

export default VideoDetail;

