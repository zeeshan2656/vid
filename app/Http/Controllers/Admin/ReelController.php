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

    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'video' => 'required|file|mimetypes:video/mp4,video/quicktime,video/x-msvideo,video/x-ms-wmv|max:512000', // 500MB max
        ]);

        if ($request->hasFile('video')) {
            $file = $request->file('video');
            $originalName = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
            $fileName = Str::slug($originalName) . '_' . time() . '.' . $file->getClientOriginalExtension();

            // Store reel file
            $path = $file->storeAs('reels', $fileName, 'public');
            $absolutePath = Storage::disk('public')->path($path);

            // Extract metadata
            $metadata = $this->videoService->getMetadata($absolutePath);

            // Generate thumbnails
            $outputDirName = 'reel_' . Str::slug($originalName) . '_' . time();
            $thumbnails = $this->videoService->generateThumbnails($absolutePath, $metadata['duration'], $outputDirName);

            // Create Reel
            $reel = Reel::create([
                'title' => $request->title,
                'description' => $request->description,
                'video_path' => Storage::url($path),
                'thumbnail_path' => !empty($thumbnails) ? $thumbnails[0] : null,
                'duration' => $metadata['duration'],
                'resolution' => $metadata['resolution'],
                'orientation' => $metadata['orientation'] ?? 'portrait',
                'status' => 'published',
                'published_at' => now(),
            ]);

            // Clear cache
            $this->clearCache();

            return response()->json([
                'message' => 'Reel uploaded and processed successfully',
                'reel' => $reel
            ], 201);
        }

        return response()->json(['error' => 'Video file not provided'], 400);
    }

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
        $videoPath = str_replace('/storage/', '', $reel->video_path);
        Storage::disk('public')->delete($videoPath);

        if ($reel->thumbnail_path) {
            $thumbPath = str_replace('/storage/', '', $reel->thumbnail_path);
            Storage::disk('public')->delete($thumbPath);
            
            $folder = dirname($thumbPath);
            if ($folder !== '.' && $folder !== 'thumbnails' && Str::startsWith($folder, 'thumbnails/reel_')) {
                Storage::disk('public')->deleteDirectory($folder);
            }
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
            $videoPath = str_replace('/storage/', '', $reel->video_path);
            Storage::disk('public')->delete($videoPath);

            if ($reel->thumbnail_path) {
                $thumbPath = str_replace('/storage/', '', $reel->thumbnail_path);
                Storage::disk('public')->delete($thumbPath);
                
                $folder = dirname($thumbPath);
                if ($folder !== '.' && $folder !== 'thumbnails' && Str::startsWith($folder, 'thumbnails/reel_')) {
                    Storage::disk('public')->deleteDirectory($folder);
                }
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
