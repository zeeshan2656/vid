<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Video;
use App\Models\Comment;
use App\Models\Advertisement;
use App\Services\AdService;
use Illuminate\Support\Facades\Cache;

class VideoController extends Controller
{
    protected AdService $adService;

    // Fields returned for listing views (homepage, recommendations) — lean payload
    private const LISTING_FIELDS = [
        'id', 'title', 'thumbnail_path', 'duration', 'resolution', 'views', 'published_at',
    ];

    private const DETAIL_FIELDS = [
        'id', 'title', 'description', 'video_path', 'thumbnail_path',
        'duration', 'resolution', 'views', 'status', 'published_at', 'created_at',
    ];

    public function __construct(AdService $adService)
    {
        $this->adService = $adService;
    }

    public function index(Request $request)
    {
        $page   = (int) $request->get('page', 1);
        $device = $request->get('device', 'mobile');

        $search = $request->get('search');

        if (!empty($search)) {
            // Retrieve matching videos dynamically
            $videos = Video::where('status', 'published')
                ->where(function ($query) use ($search) {
                    $query->where('title', 'like', "%{$search}%")
                          ->orWhere('description', 'like', "%{$search}%");
                })
                ->select(self::LISTING_FIELDS)
                ->latest('published_at')
                ->paginate(20)
                ->toArray();
        } else {
            // Cache only the video listing (lean fields, no description/video_path/all_thumbnails)
            $videos = Cache::remember("homepage_videos_page_{$page}_v3", 300, function () {
                return Video::where('status', 'published')
                    ->select(self::LISTING_FIELDS)
                    ->latest('published_at')
                    ->paginate(20)
                    ->toArray();
            });
        }

        $homeTopAd    = $this->adService->getAdForPlacement('home_top', $device);
        $homeMiddleAd = $this->adService->getAdForPlacement('home_middle', $device);

        $defaultAd  = $this->adService->getAdForPlacement('homepage_default_ad', $device);
        $row1Ad     = $this->adService->getAdForPlacement('homepage_row_1_ad', $device) ?? $defaultAd;
        $row2Ad     = $this->adService->getAdForPlacement('homepage_row_2_ad', $device) ?? $defaultAd;
        $row3Ad     = $this->adService->getAdForPlacement('homepage_row_3_ad', $device) ?? $defaultAd;
        $row4Ad     = $this->adService->getAdForPlacement('homepage_row_4_ad', $device) ?? $defaultAd;
        $row5Ad     = $this->adService->getAdForPlacement('homepage_row_5_ad', $device) ?? $defaultAd;

        return response()->json([
            'videos' => $videos,
            'ads'    => [
                'home_top'              => $homeTopAd,
                'home_middle'           => $homeMiddleAd,
                'homepage_row_1_ad'     => $row1Ad,
                'homepage_row_2_ad'     => $row2Ad,
                'homepage_row_3_ad'     => $row3Ad,
                'homepage_row_4_ad'     => $row4Ad,
                'homepage_row_5_ad'     => $row5Ad,
                'homepage_default_ad'   => $defaultAd,
                'video_grid_inline'     => $row1Ad ?? $defaultAd,
                'mobile_video_feed_ad'  => $row1Ad ?? $defaultAd,
            ],
        ])->header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    }

    public function show(Request $request, $id)
    {
        $device = $request->get('device', 'mobile');

        // Full detail for the active video
        $video = Cache::remember("video_detail_{$id}_v2", 3600, function () use ($id) {
            return Video::where('status', 'published')
                ->select(self::DETAIL_FIELDS)
                ->findOrFail($id)
                ->toArray();
        });

        // Comments cached for 10 seconds — short TTL for freshness
        $comments = Cache::remember("video_comments_{$id}", 10, function () use ($id) {
            return Comment::where('video_id', $id)
                ->where('status', 'approved')
                ->select(['id', 'video_id', 'username', 'content', 'created_at'])
                ->latest()
                ->get()
                ->toArray();
        });

        // Recommendations — lean fields only, no description/video_path
        $recommendations = Cache::remember("video_recommendations_{$id}_v2", 600, function () use ($id) {
            return Video::where('status', 'published')
                ->where('id', '!=', $id)
                ->select(self::LISTING_FIELDS)
                ->latest('published_at')
                ->limit(6)
                ->get()
                ->toArray();
        });

        $playerSidebarAd      = $this->adService->getAdForPlacement('video_sidebar', $device);
        $playerBottomAd       = $this->adService->getAdForPlacement('video_bottom', $device);
        $playerOverlayAd      = $this->adService->getAdForPlacement('video_player_overlay', $device);
        $recommendedVideosAd  = $this->adService->getAdForPlacement('recommended_videos_banner', $device);
        $aboveCommentsAd      = $this->adService->getAdForPlacement('video_above_comments', $device);

        return response()->json([
            'video'           => $video,
            'comments'        => $comments,
            'recommendations' => $recommendations,
            'ads'             => [
                'video_sidebar'             => $playerSidebarAd,
                'video_bottom'              => $playerBottomAd,
                'video_player_overlay'      => $playerOverlayAd,
                'recommended_videos_banner' => $recommendedVideosAd,
                'video_above_comments'      => $aboveCommentsAd,
            ],
        ]);
    }

    public function incrementViews($id)
    {
        Video::where('id', $id)->increment('views');
        // Invalidate cached detail so view count updates eventually propagate
        Cache::forget("video_detail_{$id}_v2");
        return response()->json(['success' => true]);
    }

    public function trackAdImpression($id)
    {
        Advertisement::where('id', $id)->increment('impressions');
        return response()->json(['success' => true]);
    }

    public function trackAdClick($id)
    {
        Advertisement::where('id', $id)->increment('clicks');
        return response()->json(['success' => true]);
    }

    public function getFooterAd(Request $request)
    {
        $device    = $request->get('device', 'mobile');
        $footerAd  = $this->adService->getAdForPlacement('footer_top', $device);
        return response()->json(['ad' => $footerAd]);
    }

    /**
     * Stream a video file with proper HTTP Range support for seeking.
     */
    public function stream(Request $request, $filename)
    {
        $path = storage_path('app/public/videos/' . $filename);

        if (!file_exists($path)) {
            abort(404, 'Video not found.');
        }

        $size       = filesize($path);
        $mime       = 'video/mp4';
        $start      = 0;
        $end        = $size - 1;
        $statusCode = 200;
        $headers    = [
            'Content-Type'   => $mime,
            'Accept-Ranges'  => 'bytes',
            'Content-Length' => $size,
            'Cache-Control'  => 'public, max-age=86400',
        ];

        if ($request->hasHeader('Range')) {
            $range = $request->header('Range');
            if (preg_match('/bytes=(\d*)-(\d*)/', $range, $matches)) {
                $start = $matches[1] !== '' ? intval($matches[1]) : 0;
                $end   = $matches[2] !== '' ? intval($matches[2]) : $size - 1;

                if ($start > $end || $start >= $size) {
                    return response('', 416)->header('Content-Range', "bytes */$size");
                }

                $length                    = $end - $start + 1;
                $statusCode                = 206;
                $headers['Content-Length'] = $length;
                $headers['Content-Range']  = "bytes $start-$end/$size";
            }
        }

        return response()->stream(function () use ($path, $start, $end) {
            $fp         = fopen($path, 'rb');
            fseek($fp, $start);
            $remaining  = $end - $start + 1;
            $bufferSize = 8192;
            while ($remaining > 0 && !feof($fp)) {
                $read       = min($bufferSize, $remaining);
                echo fread($fp, $read);
                $remaining -= $read;
                flush();
            }
            fclose($fp);
        }, $statusCode, $headers);
    }
}
