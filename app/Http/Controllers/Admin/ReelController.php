<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\Reel;
use App\Services\VideoService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReelController extends Controller
{
    protected VideoService $videoService;

    public function __construct(VideoService $videoService)
    {
        $this->videoService = $videoService;
    }

    public function index(Request $request)
    {
        $perPage = $request->input('per_page', 500);
        if (!is_numeric($perPage) || $perPage < 1) {
            $perPage = 500;
        } else {
            $perPage = min(intval($perPage), 500);
        }

        $reels = Reel::latest()->paginate($perPage);
        return response()->json($reels);
    }

    // Note: Reel uploads now use the shared chunked upload pipeline
    // in VideoController (uploadChunk + processUpload with file_type=reel).
    // The old single-file store method has been removed.


    public function update(Request $request, $id)
    {
        $reel = Reel::findOrFail($id);

        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'required|in:draft,published',
        ]);

        $reel->update([
            'title' => $request->title,
            'description' => $request->description,
            'status' => $request->status,
        ]);

        $this->clearCache();
        Cache::forget("reel_detail_{$id}_v2");

        return response()->json([
            'message' => 'Reel updated successfully',
            'reel' => $reel
        ]);
    }

    public function destroy($id)
    {
        $reel = Reel::findOrFail($id);

        // Delete files
        $videoPath = ltrim(str_replace('/storage/', '', parse_url($reel->video_path, PHP_URL_PATH)), '/');
        Storage::disk('public')->delete($videoPath);

        if ($reel->thumbnail_path) {
            $this->videoService->deleteThumbnail($reel->thumbnail_path);
        }

        $reel->delete();

        $this->clearCache();
        Cache::forget("reel_detail_{$id}_v2");

        return response()->json([
            'message' => 'Reel and files deleted successfully'
        ]);
    }

    public function bulkDestroy(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer|exists:reels,id',
        ]);

        $ids = $request->input('ids');
        $reels = Reel::whereIn('id', $ids)->get();

        foreach ($reels as $reel) {
            // Delete files
            $videoPath = ltrim(str_replace('/storage/', '', parse_url($reel->video_path, PHP_URL_PATH)), '/');
            Storage::disk('public')->delete($videoPath);

            if ($reel->thumbnail_path) {
                $this->videoService->deleteThumbnail($reel->thumbnail_path);
            }

            $reel->delete();
            Cache::forget("reel_detail_{$reel->id}_v2");
        }

        $this->clearCache();

        return response()->json([
            'message' => 'Selected reels and files deleted successfully'
        ]);
    }

    private function clearCache(): void
    {
        Cache::forget("reels_stream_list");
        Cache::forget("reels_stream_list_v2");
    }
}
