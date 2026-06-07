<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\Video;
use App\Models\Reel;
use App\Services\VideoService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class VideoController extends Controller
{
    protected VideoService $videoService;

    public function __construct(VideoService $videoService)
    {
        $this->videoService = $videoService;
    }

    public static function formatTitleFromFilename(string $filename): string
    {
        $name = pathinfo($filename, PATHINFO_FILENAME);
        $name = str_replace(['_', '-'], ' ', $name);
        return ucwords(strtolower($name));
    }

    public function getChunkStatus(Request $request)
    {
        $request->validate([
            'file_id' => 'required|string',
            'filename' => 'required|string',
        ]);

        $fileId = $request->input('file_id');
        
        $uploadedChunks = [];
        if (Storage::disk('local')->exists("tmp/{$fileId}")) {
            $files = Storage::disk('local')->files("tmp/{$fileId}");
            foreach ($files as $file) {
                $basename = basename($file);
                if (preg_match('/^chunk_(\d+)$/', $basename, $matches)) {
                    $uploadedChunks[] = (int)$matches[1];
                }
            }
        }

        sort($uploadedChunks);

        $nextChunk = 0;
        while (in_array($nextChunk, $uploadedChunks)) {
            $nextChunk++;
        }

        return response()->json([
            'uploaded_chunks' => $uploadedChunks,
            'next_chunk' => $nextChunk,
        ]);
    }

    public function uploadChunk(Request $request)
    {
        $request->validate([
            'file_id' => 'required|string',
            'chunk_index' => 'required|integer',
            'total_chunks' => 'required|integer',
            'filename' => 'required|string',
            'file_type' => 'required|in:video,reel',
            'title' => 'nullable|string',
            'description' => 'nullable|string',
            'file' => 'required|file',
        ]);

        $fileId = $request->input('file_id');
        $chunkIndex = $request->input('chunk_index');
        $totalChunks = $request->input('total_chunks');
        $filename = $request->input('filename');
        $fileType = $request->input('file_type');
        $title = $request->input('title');
        $description = $request->input('description');

        $file = $request->file('file');
        
        $file->storeAs("tmp/{$fileId}", "chunk_{$chunkIndex}", 'local');

        $allChunksUploaded = true;
        for ($i = 0; $i < $totalChunks; $i++) {
            if (!Storage::disk('local')->exists("tmp/{$fileId}/chunk_{$i}")) {
                $allChunksUploaded = false;
                break;
            }
        }

        if ($allChunksUploaded) {
            $originalName = pathinfo($filename, PATHINFO_FILENAME);
            $extension = pathinfo($filename, PATHINFO_EXTENSION);
            $cleanFileName = Str::slug($originalName) . '_' . time() . '.' . $extension;

            $folder = $fileType === 'reel' ? 'reels' : 'videos';
            
            Storage::disk('public')->makeDirectory($folder);
            
            $destinationPath = Storage::disk('public')->path("{$folder}/{$cleanFileName}");

            $out = fopen($destinationPath, 'wb');
            if (!$out) {
                return response()->json(['error' => 'Failed to open destination file for merging'], 500);
            }

            for ($i = 0; $i < $totalChunks; $i++) {
                $chunkPath = Storage::disk('local')->path("tmp/{$fileId}/chunk_{$i}");
                $in = fopen($chunkPath, 'rb');
                if ($in) {
                    while ($buff = fread($in, 4096)) {
                        fwrite($out, $buff);
                    }
                    fclose($in);
                } else {
                    fclose($out);
                    return response()->json(['error' => "Failed to read chunk {$i} for merging"], 500);
                }
            }
            fclose($out);

            Storage::disk('local')->deleteDirectory("tmp/{$fileId}");

            $absolutePath = $destinationPath;

            $metadata = $this->videoService->getMetadata($absolutePath);

            $outputDirName = ($fileType === 'reel' ? 'reel_' : '') . Str::slug($originalName) . '_' . time();
            $thumbnails = $this->videoService->generateThumbnails($absolutePath, $metadata['duration'], $outputDirName);

            $defaultTitle = $title ?: self::formatTitleFromFilename($filename);

            if ($fileType === 'video') {
                $model = Video::create([
                    'title' => $defaultTitle,
                    'description' => $description,
                    'video_path' => Storage::url("videos/{$cleanFileName}"),
                    'thumbnail_path' => !empty($thumbnails) ? $thumbnails[0] : null,
                    'all_thumbnails' => $thumbnails,
                    'duration' => $metadata['duration'],
                    'resolution' => $metadata['resolution'],
                    'status' => 'published',
                    'published_at' => now(),
                ]);

                $this->clearCache();

                return response()->json([
                    'message' => 'Upload complete',
                    'video' => $model,
                    'type' => 'video'
                ], 201);
            } else {
                $model = Reel::create([
                    'title' => $defaultTitle,
                    'description' => $description,
                    'video_path' => Storage::url("reels/{$cleanFileName}"),
                    'thumbnail_path' => !empty($thumbnails) ? $thumbnails[0] : null,
                    'duration' => $metadata['duration'],
                    'resolution' => $metadata['resolution'],
                    'orientation' => $metadata['orientation'] ?? 'portrait',
                    'status' => 'published',
                    'published_at' => now(),
                ]);

                Cache::forget("reels_stream_list");

                return response()->json([
                    'message' => 'Upload complete',
                    'reel' => $model,
                    'type' => 'reel'
                ], 201);
            }
        }

        return response()->json([
            'status' => 'chunk_saved',
            'chunk_index' => $chunkIndex,
            'next_chunk' => $chunkIndex + 1
        ], 200);
    }

    public function index(Request $request)
    {
        $query = Video::query();

        // Search support
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // Filter support (status)
        if ($request->filled('status')) {
            $status = $request->input('status');
            $query->where('status', $status);
        }

        // Sorting support
        $sortBy = $request->input('sortBy', 'created_at');
        $sortOrder = $request->input('sortOrder', 'desc');

        $allowedSorts = ['id', 'title', 'duration', 'views', 'status', 'created_at', 'published_at'];
        if (!in_array($sortBy, $allowedSorts)) {
            $sortBy = 'created_at';
        }
        $sortOrder = strtolower($sortOrder) === 'asc' ? 'asc' : 'desc';

        $query->orderBy($sortBy, $sortOrder);

        // Capacity of 500 videos per page
        $perPage = $request->input('per_page', 500);
        if (!is_numeric($perPage) || $perPage < 1) {
            $perPage = 500;
        } else {
            $perPage = min(intval($perPage), 500);
        }

        $videos = $query->paginate($perPage);
        return response()->json($videos);
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
            
            // Store video file
            $path = $file->storeAs('videos', $fileName, 'public');
            $absolutePath = Storage::disk('public')->path($path);
            
            // Extract metadata
            $metadata = $this->videoService->getMetadata($absolutePath);
            
            // Generate 5 thumbnails
            $outputDirName = Str::slug($originalName) . '_' . time();
            $thumbnails = $this->videoService->generateThumbnails($absolutePath, $metadata['duration'], $outputDirName);
            
            // Create Video entry
            $video = Video::create([
                'title' => $request->title,
                'description' => $request->description,
                'video_path' => Storage::url($path),
                'thumbnail_path' => !empty($thumbnails) ? $thumbnails[0] : null,
                'all_thumbnails' => $thumbnails,
                'duration' => $metadata['duration'],
                'resolution' => $metadata['resolution'],
                'status' => 'published',
                'published_at' => now(),
            ]);

            // Clear homepage/list cache
            $this->clearCache();

            return response()->json([
                'message' => 'Video uploaded and processed successfully',
                'video' => $video
            ], 201);
        }

        return response()->json(['error' => 'Video file not provided'], 400);
    }

    public function update(Request $request, $id)
    {
        $video = Video::findOrFail($id);

        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'thumbnail_path' => 'nullable|string',
            'status' => 'required|in:draft,published',
        ]);

        $video->update([
            'title' => $request->title,
            'description' => $request->description,
            'thumbnail_path' => $request->thumbnail_path,
            'status' => $request->status,
        ]);

        // Clear targeted caches (both versioned keys)
        $this->clearCache();
        Cache::forget("video_detail_{$id}_v2");
        Cache::forget("video_recommendations_{$id}_v2");

        return response()->json([
            'message' => 'Video updated successfully',
            'video' => $video
        ]);
    }

    public function destroy($id)
    {
        $video = Video::findOrFail($id);

        // Delete video file
        $videoPath = str_replace('/storage/', '', $video->video_path);
        Storage::disk('public')->delete($videoPath);

        // Delete all generated thumbnails
        if (is_array($video->all_thumbnails)) {
            foreach ($video->all_thumbnails as $thumbUrl) {
                $thumbPath = str_replace('/storage/', '', $thumbUrl);
                Storage::disk('public')->delete($thumbPath);
            }
        }

        // Delete from DB
        $video->delete();

        // Clear targeted caches (both versioned keys)
        $this->clearCache();
        Cache::forget("video_detail_{$id}_v2");
        Cache::forget("video_recommendations_{$id}_v2");

        return response()->json([
            'message' => 'Video and files deleted successfully'
        ]);
    }

    public function bulkDestroy(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer|exists:videos,id',
        ]);

        $ids = $request->input('ids');
        $videos = Video::whereIn('id', $ids)->get();

        foreach ($videos as $video) {
            // Delete video file
            $videoPath = str_replace('/storage/', '', $video->video_path);
            Storage::disk('public')->delete($videoPath);

            // Delete all generated thumbnails
            if (is_array($video->all_thumbnails)) {
                foreach ($video->all_thumbnails as $thumbUrl) {
                    $thumbPath = str_replace('/storage/', '', $thumbUrl);
                    Storage::disk('public')->delete($thumbPath);
                }
            }

            // Delete from DB
            $video->delete();
            Cache::forget("video_detail_{$video->id}_v2");
            Cache::forget("video_recommendations_{$video->id}_v2");
        }

        // Clear cache
        $this->clearCache();

        return response()->json([
            'message' => 'Selected videos and files deleted successfully'
        ]);
    }

    private function clearCache(): void
    {
        // Clear both old (v2) and current (v3) versioned homepage cache keys
        for ($i = 1; $i <= 20; $i++) {
            Cache::forget("homepage_videos_page_{$i}_v2");
            Cache::forget("homepage_videos_page_{$i}_v3");
        }
    }
}
