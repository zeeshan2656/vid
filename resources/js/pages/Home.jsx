import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import AdRenderer from '../components/AdRenderer';

// Memoized single video card — prevents full grid re-render on loadMore
const VideoCard = memo(function VideoCard({ video, formatDuration, isFirst }) {
    return (
        <Link to={`/video/${video.id}`} className="video-card glass-panel" style={{ padding: '8px' }}>
            <div className="video-card-thumb">
                <img
                    src={video.thumbnail_path || '/placeholder-thumb.jpg'}
                    alt={video.title}
                    loading={isFirst ? 'eager' : 'lazy'}
                    fetchpriority={isFirst ? 'high' : 'auto'}
                />
                <span className="video-duration">{formatDuration(video.duration)}</span>
            </div>
            <div className="video-card-details">
                <h3 className="video-card-title">{video.title}</h3>
                <div className="video-card-meta">
                    <span>👁️ {(video.views || 0).toLocaleString()} views</span>
                    <span>⏱️ {video.resolution || 'HD'}</span>
                </div>
            </div>
        </Link>
    );
});

// Memoized ad card
const AdCard = memo(function AdCard({ ad, onAdClick }) {
    return (
        <div className="video-card glass-panel ad-card" style={{ padding: '0px', cursor: 'pointer', overflow: 'hidden', borderRadius: '16px' }}>
            <div className="video-card-thumb" style={{ background: '#07070c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '0px', width: '100%', height: '100%', aspectRatio: '16/9' }}>
                {ad.image_path ? (
                    <a
                        href={ad.redirect_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', width: '100%', height: '100%' }}
                        onClick={() => onAdClick(ad.id)}
                    >
                        <img src={ad.image_path} alt={ad.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    </a>
                ) : (
                    <div style={{ transform: 'scale(0.9)', width: '100%', textAlign: 'center' }}>
                        <AdRenderer adCode={ad.ad_code} />
                    </div>
                )}
                <span style={{
                    position: 'absolute', top: '8px', left: '8px',
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px',
                    fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px',
                    pointerEvents: 'none'
                }}>Sponsored</span>
            </div>
        </div>
    );
});

const AD_PLACEMENT_KEYS = [
    'home_top', 'home_middle',
    'homepage_row_1_ad', 'homepage_row_2_ad', 'homepage_row_3_ad',
    'homepage_row_4_ad', 'homepage_row_5_ad', 'homepage_default_ad',
];

export default function Home({ showSearch, setShowSearch }) {
    const [videos, setVideos]   = useState([]);
    const [ads, setAds]         = useState({});
    const [page, setPage]       = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const loadingRef            = useRef(false); // Avoid stale-closure issue with loading state

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    useEffect(() => {
        if (!showSearch) {
            setSearchQuery('');
        }
    }, [showSearch]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const getDeviceType = useCallback(() => window.innerWidth <= 768 ? 'mobile' : 'desktop', []);

    const formatDuration = useCallback((seconds) => {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, []);

    const handleAdClick = useCallback((adId) => {
        axios.post(`/api/ads/${adId}/click`).catch(() => {});
    }, []);

    const loadVideos = useCallback((pageNum, initial = false) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);

        const device = getDeviceType();
        axios.get(`/api/videos`, {
            params: {
                page: pageNum,
                device: device,
                search: debouncedQuery
            }
        })
            .then(res => {
                const newVideos  = res.data.videos?.data ?? [];
                const pagination = res.data.videos ?? {};

                if (initial) {
                    setVideos(newVideos);
                    setAds(res.data.ads || {});
                } else {
                    setVideos(prev => [...prev, ...newVideos]);
                }

                setHasMore((pagination.current_page ?? 1) < (pagination.last_page ?? 1));
                setPage(pageNum);
            })
            .catch(() => {})
            .finally(() => {
                loadingRef.current = false;
                setLoading(false);
            });
    }, [getDeviceType, debouncedQuery]);

    useEffect(() => {
        loadVideos(1, true);
    }, [loadVideos]);

    const handleLoadMore = useCallback(() => {
        loadVideos(page + 1);
    }, [loadVideos, page]);

    // Log impressions once when ads first load (deduplicated by ad id)
    const loggedImpressionsRef = useRef(new Set());
    useEffect(() => {
        if (!ads || Object.keys(ads).length === 0) return;
        AD_PLACEMENT_KEYS.forEach(key => {
            const ad = ads[key];
            if (ad && !loggedImpressionsRef.current.has(ad.id)) {
                loggedImpressionsRef.current.add(ad.id);
                axios.post(`/api/ads/${ad.id}/impression`).catch(() => {});
            }
        });
    }, [ads]);

    // Build grid items — memoized so it only recomputes when videos/ads change
    const gridItems = useCallback(() => {
        const items = [];
        videos.forEach((video, index) => {
            items.push(
                <VideoCard
                    key={`video-${video.id}`}
                    video={video}
                    formatDuration={formatDuration}
                    isFirst={index === 0}
                />
            );
            if ((index + 1) % 4 === 0) {
                const rowIndex = Math.floor((index + 1) / 4);
                const ad = ads[`homepage_row_${rowIndex}_ad`] || ads.homepage_default_ad;
                if (ad) {
                    items.push(<AdCard key={`ad-${index}`} ad={ad} onAdClick={handleAdClick} />);
                }
            }
        });
        return items;
    }, [videos, ads, formatDuration, handleAdClick]);

    return (
        <main className="main-content">
            {/* Top Advertisement Spot */}
            {ads.home_top && (
                <div className="ad-banner">
                    {ads.home_top.image_path ? (
                        <a href={ads.home_top.redirect_url} target="_blank" rel="noopener noreferrer">
                            <img src={ads.home_top.image_path} alt={ads.home_top.title} loading="lazy" />
                        </a>
                    ) : (
                        <AdRenderer adCode={ads.home_top.ad_code} />
                    )}
                </div>
            )}

            {/* Search Bar */}
            {showSearch && (
                <div style={{ margin: '0 auto 2.5rem auto', maxWidth: '600px', width: '100%', padding: '0 1rem' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.03)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '24px',
                        padding: '8px 16px',
                        gap: '12px',
                        boxShadow: '0 4px 30px rgba(0,0,0,0.2)'
                    }}>
                        <svg style={{ width: '20px', height: '20px', color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search videos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                flex: 1,
                                background: 'none',
                                border: 'none',
                                outline: 'none',
                                color: '#fff',
                                fontSize: '1rem',
                                padding: '4px 0'
                            }}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                    padding: '0 4px'
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Videos Grid */}
            {videos.length === 0 && !loading ? (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {debouncedQuery ? "No videos found matching your search." : "No videos uploaded yet. Check back soon!"}
                </div>
            ) : (
                <div className="video-grid">
                    {gridItems()}
                </div>
            )}

            {loading && <div className="spinner"></div>}

            {hasMore && !loading && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                    <button onClick={handleLoadMore} className="btn-submit" style={{ display: 'inline-block' }}>
                        Load More Videos
                    </button>
                </div>
            )}

            {/* Middle Advertisement Spot */}
            {ads.home_middle && (
                <div className="ad-banner" style={{ marginTop: '3rem' }}>
                    {ads.home_middle.image_path ? (
                        <a href={ads.home_middle.redirect_url} target="_blank" rel="noopener noreferrer">
                            <img src={ads.home_middle.image_path} alt={ads.home_middle.title} loading="lazy" />
                        </a>
                    ) : (
                        <AdRenderer adCode={ads.home_middle.ad_code} />
                    )}
                </div>
            )}
        </main>
    );
}
