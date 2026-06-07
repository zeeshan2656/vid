<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

use App\Models\Comment;
use Illuminate\Support\Facades\Cache;

class CommentController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'video_id' => 'nullable|exists:videos,id',
            'reel_id' => 'nullable|exists:reels,id',
            'username' => 'nullable|string|max:50',
            'content' => 'required|string|max:1000',
        ]);

        if (!$request->video_id && !$request->reel_id) {
            return response()->json(['error' => 'Either video_id or reel_id is required.'], 422);
        }

        $comment = Comment::create([
            'video_id' => $request->video_id,
            'reel_id' => $request->reel_id,
            'username' => $request->username ?: 'Anonymous',
            'content' => $request->content,
            'ip_address' => $request->ip(),
            'status' => 'approved',
        ]);

        if ($request->video_id) {
            Cache::forget("video_comments_{$request->video_id}");
        }
        if ($request->reel_id) {
            Cache::forget("reel_comments_{$request->reel_id}");
            Cache::forget("reel_detail_{$request->reel_id}");
            Cache::forget("reels_stream_list");
        }

        return response()->json([
            'message' => 'Comment posted successfully',
            'comment' => $comment
        ], 201);
    }

    public function destroy($id)
    {
        $comment = Comment::findOrFail($id);
        
        $videoId = $comment->video_id;
        $reelId = $comment->reel_id;

        $comment->delete();

        if ($videoId) {
            Cache::forget("video_comments_{$videoId}");
        }
        if ($reelId) {
            Cache::forget("reel_comments_{$reelId}");
            Cache::forget("reel_detail_{$reelId}");
            Cache::forget("reels_stream_list");
        }

        return response()->json([
            'message' => 'Comment deleted successfully'
        ]);
    }
}
