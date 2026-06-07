import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdRenderer from '../components/AdRenderer';

export default function Reels() {
    const navigate = useNavigate();
    const [reels, setReels] = useState([]);
    const [ad, setAd] = useState(null);
    const [topAd, setTopAd] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [showComments, setShowComments] = useState(false);
    const [activeReelComments, setActiveReelComments] = useState([]);
    const [username, setUsername] = useState('');
    const [commentContent, setCommentContent] = useState('');
    const [commentStatus, setCommentStatus] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    
    // Interactions state
    const [likedStates, setLikedStates] = useState({}); // { reelId: boolean }
    const [pulseStates, setPulseStates] = useState({}); // { reelId: boolean }

    // Overlay ad animation state
    const [adVisible, setAdVisible] = useState(true);
    const [adKey, setAdKey] = useState(0); // Forces AdRenderer remount to re-execute scripts

    const containerRef = useRef(null);
    const videoRefs = useRef({}); // { index: HTMLVideoElement }
    const viewLoggedRef = useRef({}); // { reelId: boolean }
    const viewTimeoutRef = useRef(null);
    const prevActiveIndexRef = useRef(null); // Track previous active index for ad reload

    const getDeviceType = useCallback(() => window.innerWidth <= 768 ? 'mobile' : 'desktop', []);

    const formatCount = useCallback((num) => {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000)    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num.toString();
    }, []);

    useEffect(() => {
        const device = getDeviceType();
        axios.get(`/api/reels?device=${device}`)
            .then(res => {
                const fetchedReels = res.data.reels || [];
                const fetchedAd = res.data.ad;
                const fetchedTopAd = res.data.top_ad;
                
                // Initialize likedStates from localStorage
                const localLikes = {};
                fetchedReels.forEach(reel => {
                    const liked = localStorage.getItem(`reel_liked_${reel.id}`) === 'true';
                    localLikes[reel.id] = liked;
                });
                setLikedStates(localLikes);

                // Interleave advertisement card every 5 reels if an ad exists
                let combined = [];
                if (fetchedReels.length > 0) {
                    fetchedReels.forEach((reel, index) => {
                        combined.push({ type: 'reel', data: reel });
                        if (fetchedAd && (index + 1) % 5 === 0) {
                            combined.push({ type: 'ad', data: fetchedAd });
                        }
                    });
                }
                
                setReels(combined);
                setAd(fetchedAd);
                setTopAd(fetchedTopAd);
            })
            .catch(err => console.error("Error loading reels:", err))
            .finally(() => setLoading(false));
    }, []);

    // Fetch a fresh overlay ad from the backend
    const fetchOverlayAd = useCallback(() => {
        const device = getDeviceType();
        return axios.get(`/api/reels/overlay-ad?device=${device}`)
            .then(res => {
                const newAd = res.data.ad;
                if (newAd) {
                    setTopAd(newAd);
                    setAdKey(prev => prev + 1);
                }
            })
            .catch(() => {});
    }, [getDeviceType]);

    // Scroll ad out, reload, then scroll ad back in when active reel changes
    useEffect(() => {
        if (prevActiveIndexRef.current === null) {
            // First render – just record the index, don't refetch
            prevActiveIndexRef.current = activeIndex;
            return;
        }
        if (prevActiveIndexRef.current !== activeIndex) {
            prevActiveIndexRef.current = activeIndex;

            // 1. Slide the ad out (scroll away with the reel)
            setAdVisible(false);

            // 2. After slide-out animation completes, fetch fresh ad, then slide back in
            setTimeout(() => {
                fetchOverlayAd().finally(() => {
                    // Small delay so the new ad content renders before animating in
                    setTimeout(() => {
                        setAdVisible(true);
                    }, 50);
                });
            }, 300); // matches CSS transition duration
        }
    }, [activeIndex]);

    // Track top ad impression when topAd is loaded
    useEffect(() => {
        if (topAd) {
            axios.post(`/api/ads/${topAd.id}/impression`)
                .catch(err => console.error("Error logging top ad impression:", err));
        }
    }, [topAd]);

    const handleTopAdClick = () => {
        if (!topAd) return;
        axios.post(`/api/ads/${topAd.id}/click`)
            .catch(err => console.error("Error logging top ad click:", err));
        if (topAd.redirect_url) {
            window.open(topAd.redirect_url, '_blank', 'noopener,noreferrer');
        }
    };

    // Intersection Observer to monitor active slide
    useEffect(() => {
        if (reels.length === 0) return;

        const observerOptions = {
            root: containerRef.current,
            rootMargin: '0px',
            threshold: 0.7 // Slide must be at least 70% visible
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = parseInt(entry.target.getAttribute('data-index'), 10);
                    setActiveIndex(index);
                }
            });
        }, observerOptions);

        // Wait for slides to render
        const timer = setTimeout(() => {
            const slides = containerRef.current?.querySelectorAll('.reel-item');
            slides?.forEach(slide => observer.observe(slide));
        }, 100);

        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, [reels]);

    // Handle Play/Pause logic based on activeIndex
    useEffect(() => {
        if (reels.length === 0) return;

        // Clear any pending view counter timers
        if (viewTimeoutRef.current) {
            clearTimeout(viewTimeoutRef.current);
        }

        reels.forEach((item, index) => {
            const video = videoRefs.current[index];
            if (!video) return;

            if (index === activeIndex) {
                // Play active video
                video.play().catch(err => console.log("Auto-play blocked:", err));

                // Log view after 2.5 seconds
                const currentItem = reels[activeIndex];
                if (currentItem.type === 'reel') {
                    const reelId = currentItem.data.id;
                    if (!viewLoggedRef.current[reelId]) {
                        viewTimeoutRef.current = setTimeout(() => {
                            viewLoggedRef.current[reelId] = true;
                            
                            // Optimistically increment views count in React state
                            setReels(prevReels => prevReels.map((rItem, idx) => {
                                if (idx === activeIndex && rItem.type === 'reel') {
                                    return {
                                        ...rItem,
                                        data: {
                                            ...rItem.data,
                                            views: (rItem.data.views || 0) + 1
                                        }
                                    };
                                }
                                return rItem;
                            }));

                            axios.post(`/api/reels/${reelId}/view`)
                                .catch(err => {
                                    console.error("Error logging view:", err);
                                    // Revert view count on error
                                    setReels(prevReels => prevReels.map((rItem, idx) => {
                                        if (idx === activeIndex && rItem.type === 'reel') {
                                            return {
                                                ...rItem,
                                                data: {
                                                    ...rItem.data,
                                                    views: Math.max(0, (rItem.data.views || 0) - 1)
                                                }
                                            };
                                        }
                                        return rItem;
                                    }));
                                    viewLoggedRef.current[reelId] = false;
                                });
                        }, 2500);
                    }
                }
            } else {
                // Pause other videos
                video.pause();
                video.currentTime = 0;
            }
        });

        // Cleanup: pause all videos when unmounting or before re-running effect
        return () => {
            if (viewTimeoutRef.current) {
                clearTimeout(viewTimeoutRef.current);
            }
            Object.values(videoRefs.current).forEach(video => {
                if (video && !video.paused) {
                    video.pause();
                }
            });
        };
    }, [activeIndex, reels]);

    const handleVideoClick = useCallback((index) => {
        const video = videoRefs.current[index];
        if (!video) return;
        setPulseStates(prev => ({ ...prev, [index]: true }));
        setTimeout(() => setPulseStates(prev => ({ ...prev, [index]: false })), 800);
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, []);

    const toggleLike = useCallback((reelId, index) => {
        const isLiked = !likedStates[reelId];
        setLikedStates(prev => ({ ...prev, [reelId]: isLiked }));
        localStorage.setItem(`reel_liked_${reelId}`, isLiked ? 'true' : 'false');
        setReels(prevReels => prevReels.map((item, idx) => {
            if (idx === index && item.type === 'reel') {
                const currentLikes = item.data.likes || 0;
                return { ...item, data: { ...item.data, likes: isLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1) } };
            }
            return item;
        }));
        axios.post(`/api/reels/${reelId}/like`, { liked: isLiked })
            .catch(() => {
                setLikedStates(prev => ({ ...prev, [reelId]: !isLiked }));
                localStorage.setItem(`reel_liked_${reelId}`, !isLiked ? 'true' : 'false');
                setReels(prevReels => prevReels.map((item, idx) => {
                    if (idx === index && item.type === 'reel') {
                        const currentLikes = item.data.likes || 0;
                        return { ...item, data: { ...item.data, likes: !isLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1) } };
                    }
                    return item;
                }));
            });
    }, [likedStates]);

    const shareReel = useCallback((reel) => {
        const shareUrl = `${window.location.origin}/video/${reel.id}`;
        navigator.clipboard.writeText(shareUrl)
            .then(() => alert('Link copied to clipboard!'))
            .catch(() => alert('Failed to copy link.'));
    }, []);

    const openComments = useCallback((reelId) => {
        setShowComments(true);
        setActiveReelComments([]);
        setCommentStatus('loading');
        axios.get(`/api/reels/${reelId}`)
            .then(res => {
                setActiveReelComments(res.data.comments || []);
                setCommentStatus('');
            })
            .catch(() => {
                setCommentStatus('error');
                setErrorMsg('Failed to load comments.');
            });
    }, []);

    const handleCommentSubmit = (e) => {
        e.preventDefault();
        const currentItem = reels[activeIndex];
        if (currentItem.type !== 'reel' || !commentContent.trim()) return;

        const reelId = currentItem.data.id;
        const commentUser = username.trim() || 'Anonymous';
        const commentText = commentContent.trim();

        setCommentContent('');
        setCommentStatus('submitting');
        setErrorMsg('');

        // Temporary comment for optimistic update
        const tempComment = {
            id: `temp-${Date.now()}`,
            reel_id: reelId,
            username: commentUser,
            content: commentText,
            created_at: new Date().toISOString(),
            status: 'approved'
        };

        // Instantly display comment
        setActiveReelComments(prev => [tempComment, ...prev]);

        // Instantly update comments count in Reels state
        setReels(prevReels => prevReels.map((item, idx) => {
            if (idx === activeIndex && item.type === 'reel') {
                return {
                    ...item,
                    data: {
                        ...item.data,
                        comments_count: (item.data.comments_count || 0) + 1
                    }
                };
            }
            return item;
        }));

        // Send to server in background
        axios.post('/api/comments', {
            reel_id: reelId,
            username: commentUser,
            content: commentText
        })
        .then(res => {
            // Replace temp comment with actual comment
            setActiveReelComments(prev => prev.map(c => c.id === tempComment.id ? res.data.comment : c));
            setCommentStatus('');
        })
        .catch(err => {
            // Revert state on error
            setActiveReelComments(prev => prev.filter(c => c.id !== tempComment.id));
            setReels(prevReels => prevReels.map((item, idx) => {
                if (idx === activeIndex && item.type === 'reel') {
                    return {
                        ...item,
                        data: {
                            ...item.data,
                            comments_count: Math.max(0, (item.data.comments_count || 0) - 1)
                        }
                    };
                }
                return item;
            }));
            setCommentStatus('error');
            if (err.response && err.response.status === 429) {
                setErrorMsg("You are posting comments too fast. Wait a moment.");
            } else {
                setErrorMsg("Failed to post comment.");
            }
        });
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#000', height: '100vh', position: 'relative', overflow: 'hidden' }}>
            {/* Top Navigation Overlay replaced with cached advertisement container */}
            <div style={{
                position: 'absolute', top: '10px', left: '0', right: '0',
                display: 'flex', justifyContent: 'center', zIndex: 100, pointerEvents: 'none',
                transform: adVisible ? 'translateY(0)' : 'translateY(-120%)',
                opacity: adVisible ? 1 : 0,
                transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'
            }}>
                <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '15px', maxWidth: '95%' }}>
                    {/* Top Ad container – scrolls away with reel, reloads with fresh data */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(15,15,28,0.45)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-glass)', padding: '4px 12px', borderRadius: '8px', minHeight: '50px', maxWidth: '320px', overflow: 'hidden' }}>
                        {topAd ? (
                            <div 
                                onClick={handleTopAdClick}
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}
                            >
                                {topAd.image_path ? (
                                    topAd.media_type === 'video' ? (
                                        <video key={`ad-video-${adKey}`} src={topAd.image_path} autoPlay muted loop playsInline style={{ maxHeight: '42px', maxWidth: '100%', borderRadius: '4px', objectFit: 'contain' }} />
                                    ) : (
                                        <img key={`ad-img-${adKey}`} src={topAd.image_path} alt={topAd.title} style={{ maxHeight: '42px', maxWidth: '100%', borderRadius: '4px', objectFit: 'contain' }} />
                                    )
                                ) : (
                                    <AdRenderer key={`ad-script-${adKey}`} adCode={topAd.ad_code} />
                                )}
                            </div>
                        ) : (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                Sponsored Ad
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Vertical Swipe snap container */}
            <div 
                ref={containerRef}
                className="reels-container"
            >
                {reels.map((item, index) => {
                    if (item.type === 'ad') {
                        return (
                            <div 
                                key={`ad-${index}`}
                                className="reel-item"
                                data-index={index}
                                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', background: '#0a0a14' }}
                            >
                                <span style={{ color: 'var(--secondary)', fontSize: '0.8rem', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
                                    Sponsored Ad
                                </span>
                                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', width: '100%', maxWidth: '340px' }}>
                                    {item.data.image_path ? (
                                        <a href={item.data.redirect_url} target="_blank" rel="noopener noreferrer">
                                            <img src={item.data.image_path} alt={item.data.title} style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                        </a>
                                    ) : (
                                        <AdRenderer adCode={item.data.ad_code} />
                                    )}
                                    <h4 style={{ color: '#fff', marginTop: '1rem', fontSize: '1.1rem' }}>{item.data.title}</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Click ad to view details.</p>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>Swipe up for next reel ⬆️</span>
                            </div>
                        );
                    }

                    const reel = item.data;
                    const isLiked = likedStates[reel.id] || false;
                    const isPulsing = pulseStates[index] || false;

                    // Lazy load performance optimizations
                    const isAdjacent = index === activeIndex || index === activeIndex + 1 || index === activeIndex - 1;
                    const videoSrc = isAdjacent ? reel.video_path : '';
                    const preloadVal = isAdjacent ? 'auto' : 'none';

                    return (
                        <div 
                            key={`reel-${reel.id}`} 
                            className="reel-item"
                            data-index={index}
                        >
                    {isAdjacent ? (
                        <video 
                            ref={el => videoRefs.current[index] = el}
                            className="reel-video"
                            src={videoSrc}
                            poster={reel.thumbnail_path}
                            loop
                            muted
                            playsInline
                            preload={preloadVal}
                            onClick={() => handleVideoClick(index)}
                            style={{ 
                                width: '100vw', 
                                height: '100vh', 
                                objectFit: (reel.orientation === 'landscape' || reel.orientation === 'square') ? 'contain' : 'cover',
                                backgroundColor: '#000000'
                            }}
                        />
                    ) : (
                        // Non-adjacent reels: render thumbnail placeholder only (saves GPU/RAM)
                        <div
                            style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative' }}
                            onClick={() => handleVideoClick(index)}
                        >
                            {reel.thumbnail_path && (
                                <img
                                    src={reel.thumbnail_path}
                                    alt={reel.title}
                                    loading="lazy"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
                                />
                            )}
                        </div>
                    )}

                            {/* Play/Pause state overlay indicator */}
                            <div className={`reel-play-state ${isPulsing ? 'pulse' : ''}`}>
                                <span style={{ fontSize: '2rem', color: '#fff' }}>▶️</span>
                            </div>

                            {/* Sidebar Action Buttons (Real-time numbers properly rendered) */}
                            <div className="reel-actions">
                                <button onClick={() => navigate('/')} className="reel-action-btn" style={{ color: '#fff', borderColor: 'var(--border-glass)' }}>
                                    🏠
                                </button>
                                <span style={{ fontSize: '0.75rem', marginTop: '-12px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    Home
                                </span>

                                <button onClick={() => toggleLike(reel.id, index)} className="reel-action-btn" style={{ color: isLiked ? '#ff3e3e' : '#fff', borderColor: isLiked ? '#ff3e3e' : 'var(--border-glass)' }}>
                                    {isLiked ? '❤️' : '🤍'}
                                </button>
                                <span style={{ fontSize: '0.75rem', marginTop: '-12px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    {formatCount(reel.likes)}
                                </span>

                                <button onClick={() => openComments(reel.id)} className="reel-action-btn">
                                    💬
                                </button>
                                <span style={{ fontSize: '0.75rem', marginTop: '-12px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    {formatCount(reel.comments_count)}
                                </span>

                                <div className="reel-action-btn" style={{ cursor: 'default' }}>
                                    👁️
                                </div>
                                <span style={{ fontSize: '0.75rem', marginTop: '-12px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    {formatCount(reel.views)}
                                </span>

                                <button onClick={() => shareReel(reel)} className="reel-action-btn">
                                    📤
                                </button>
                                <span style={{ fontSize: '0.75rem', marginTop: '-12px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    Share
                                </span>
                            </div>

                            {/* Video Title and Overlay Info */}
                            <div className="reel-overlay">
                                <h3 className="reel-title">{reel.title}</h3>
                                <p className="reel-desc">{reel.description || 'No description'}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Slide-up Comments Drawer Sheet */}
            {showComments && (
                <div 
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60vh', background: 'rgba(7,7,12,0.92)', borderTop: '1px solid var(--border-glass)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', zIndex: 1000, backdropFilter: 'blur(20px)', padding: '1.5rem', display: 'flex', flexDirection: 'column', transition: 'transform 0.3s ease-out' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>Comments</h3>
                        <button 
                            onClick={() => setShowComments(false)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Comments List scroll area */}
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {commentStatus === 'loading' ? (
                            <div className="spinner"></div>
                        ) : errorMsg ? (
                            <div style={{ color: '#ff4d4d', textAlign: 'center' }}>{errorMsg}</div>
                        ) : activeReelComments.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No comments yet. Write something!</div>
                        ) : (
                            activeReelComments.map(c => (
                                <div key={c.id} className="glass-panel" style={{ padding: '10px 14px', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--secondary)', fontWeight: '600' }}>{c.username}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: '#e2e2ee' }}>{c.content}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Comment Form */}
                    <form onSubmit={handleCommentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                                type="text"
                                className="comment-input"
                                placeholder="Your Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{ width: '120px', padding: '8px 12px' }}
                                disabled={commentStatus === 'submitting'}
                            />
                            <input 
                                type="text"
                                className="comment-input"
                                placeholder="Write comments..."
                                value={commentContent}
                                onChange={(e) => setCommentContent(e.target.value)}
                                style={{ flex: 1, padding: '8px 12px' }}
                                required
                                disabled={commentStatus === 'submitting'}
                            />
                        </div>
                        <button 
                            type="submit" 
                            className="btn-submit" 
                            style={{ width: '100%', padding: '10px', borderRadius: '8px' }}
                            disabled={commentStatus === 'submitting' || !commentContent.trim()}
                        >
                            {commentStatus === 'submitting' ? 'Posting...' : 'Send Comment'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
