<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Reel;
use App\Models\Comment;
use App\Services\AdService;
use Illuminate\Support\Facades\Cache;

class ReelController extends Controller
{
    protected AdService $adService;

    // Fields returned for the reels stream listing — lean payload
    private const LISTING_FIELDS = [
        'id', 'title', 'thumbnail_path', 'video_path', 'duration',
        'resolution', 'orientation', 'views', 'likes', 'status', 'published_at',
    ];

    public function __construct(AdService $adService)
    {
        $this->adService = $adService;
    }

    public function index(Request $request)
    {
        $device = $request->get('device', 'mobile');

        $reels = Cache::remember("reels_stream_list_v2", 600, function () {
            return Reel::where('status', 'published')
                ->select(self::LISTING_FIELDS)
                ->withCount('comments')
                ->latest('published_at')
                ->limit(50)
                ->get()
                ->toArray();
        });

        $reelsAd = $this->adService->getAdForPlacement('reels_between', $device);
        $topAd   = $this->adService->getAdForPlacement('reels_overlay_top', $device);

        return response()->json([
            'reels'  => $reels,
            'ad'     => $reelsAd,
            'top_ad' => $topAd,
        ])->header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    }

    public function show(Request $request, $id)
    {
        $device = $request->get('device', 'mobile');

        $reel = Cache::remember("reel_detail_{$id}_v2", 3600, function () use ($id) {
            return Reel::where('status', 'published')
                ->withCount('comments')
                ->findOrFail($id)
                ->toArray();
        });

        $comments = Cache::remember("reel_comments_{$id}", 10, function () use ($id) {
            return Comment::where('reel_id', $id)
                ->where('status', 'approved')
                ->select(['id', 'reel_id', 'author_name', 'content', 'created_at'])
                ->latest()
                ->get()
                ->toArray();
        });

        $reelsAd = $this->adService->getAdForPlacement('reels_between', $device);
        $topAd   = $this->adService->getAdForPlacement('reels_overlay_top', $device);

        return response()->json([
            'reel'    => $reel,
            'comments' => $comments,
            'ad'      => $reelsAd,
            'top_ad'  => $topAd,
        ]);
    }

    public function incrementViews($id)
    {
        Reel::where('id', $id)->increment('views');
        Cache::forget("reel_detail_{$id}_v2");
        Cache::forget("reels_stream_list_v2");
        return response()->json(['success' => true]);
    }

    public function toggleLike(Request $request, $id)
    {
        $liked = $request->input('liked', true);
        $reel  = Reel::findOrFail($id);

        if ($liked) {
            $reel->increment('likes');
        } else {
            if ($reel->likes > 0) {
                $reel->decrement('likes');
            }
        }

        Cache::forget("reel_detail_{$id}_v2");
        Cache::forget("reels_stream_list_v2");

        return response()->json([
            'success' => true,
            'likes'   => $reel->likes,
        ]);
    }

    public function getOverlayAd(Request $request)
    {
        $device = $request->get('device', 'mobile');
        $topAd  = $this->adService->getAdForPlacement('reels_overlay_top', $device);
        return response()->json(['ad' => $topAd]);
    }
}
