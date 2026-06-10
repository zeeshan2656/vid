<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\Video;
use App\Models\Reel;
use App\Models\Upload;
use App\Services\VideoService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
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

    /**
     * Get chunk upload status from the uploads table.
     * Returns which chunks have been received, the next expected chunk,
     * and the overall status of the upload session.
     */
    public function getChunkStatus(Request $request)
    {
        $request->validate([
            'file_id' => 'required|string',
            'filename' => 'required|string',
        ]);

        $uploadUuid = $request->input('file_id');

        $upload = Upload::where('upload_uuid', $uploadUuid)->first();

        if (!$upload) {
            return response()->json([
                'uploaded_chunks' => [],
                'next_chunk' => 0,
                'status' => 'new',
            ]);
        }

        $uploadedChunks = $upload->uploaded_chunks ?? [];
        sort($uploadedChunks);

        $nextChunk = 0;
        while (in_array($nextChunk, $uploadedChunks)) {
            $nextChunk++;
        }

        return response()->json([
            'uploaded_chunks' => $uploadedChunks,
            'next_chunk' => $nextChunk,
            'status' => $upload->status,
            'model_id' => $upload->model_id,
        ]);
    }

    /**
     * Upload a single chunk.
     *
     * Stage 1 of the 3-stage pipeline:
     *  - Saves the chunk to tmp/{uuid}/chunk_{index}
     *  - Tracks which chunks have arrived in the uploads table
     *  - When all chunks are present, merges them into the final file
     *  - Returns { status: 'uploaded' } when merge is complete (no FFmpeg yet)
     *  - Returns { status: 'chunk_saved' } for intermediate chunks
     */
    public function uploadChunk(Request $request)
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'file_id'      => 'required|string',
            'chunk_index'  => 'required|integer',
            'total_chunks' => 'required|integer',
            'filename'     => 'required|string',
            'file_type'    => 'required|in:video,reel',
            'title'        => 'nullable|string',
            'description'  => 'nullable|string',
            // NOTE: Do NOT use the 'file' rule here — it triggers Symfony's
            // FileinfoMimeTypeGuesser which crashes on Windows when the PHP
            // temp file path is empty (common with the built-in dev server).
            // We validate the uploaded file manually below instead.
            'file'         => 'required',
        ]);

        if ($validator->fails()) {
            Log::error('Upload chunk validation failed', [
                'errors'    => $validator->errors()->toArray(),
                'payload'   => $request->except(['file']),
                'has_file'  => $request->hasFile('file'),
                'file_error' => $request->hasFile('file') ? $request->file('file')->getError() : 'no file',
                'file_valid' => $request->hasFile('file') ? $request->file('file')->isValid() : false,
            ]);
            return response()->json([
                'error'  => 'Validation failed',
                'errors' => $validator->errors()->toArray()
            ], 422);
        }

        // Manual file validation — check the file arrived and is not corrupt
        if (!$request->hasFile('file') || !$request->file('file')->isValid()) {
            $phpError = $request->hasFile('file') ? $request->file('file')->getError() : UPLOAD_ERR_NO_FILE;
            Log::error('Upload chunk: file missing or invalid', [
                'php_error_code' => $phpError,
                'payload'        => $request->except(['file']),
            ]);
            return response()->json([
                'error' => 'File upload failed (PHP error code: ' . $phpError . '). Check upload_max_filesize and post_max_size in php.ini.',
            ], 422);
        }

        $uploadUuid = $request->input('file_id');
        $chunkIndex = (int) $request->input('chunk_index');
        $totalChunks = (int) $request->input('total_chunks');
        $filename = $request->input('filename');
        $fileType = $request->input('file_type');
        $title = $request->input('title');
        $description = $request->input('description');

        // Find or create the upload session
        $upload = Upload::firstOrCreate(
            ['upload_uuid' => $uploadUuid],
            [
                'file_name' => $filename,
                'file_type' => $fileType,
                'total_chunks' => $totalChunks,
                'uploaded_chunks' => [],
                'status' => 'uploading',
                'title' => $title,
                'description' => $description,
            ]
        );

        // Duplicate prevention: if already published, reject
        if ($upload->status === 'published') {
            return response()->json([
                'status' => 'already_published',
                'message' => 'This upload has already been processed.',
                'model_id' => $upload->model_id,
            ], 409);
        }

        // Reject cancelled uploads
        if ($upload->status === 'cancelled') {
            return response()->json([
                'status' => 'cancelled',
                'message' => 'This upload has been cancelled.',
            ], 409);
        }

        // Save the chunk file
        $file = $request->file('file');
        $file->storeAs("tmp/{$uploadUuid}", "chunk_{$chunkIndex}", 'local');

        // Update the uploaded_chunks list
        $chunks = $upload->uploaded_chunks ?? [];
        if (!in_array($chunkIndex, $chunks)) {
            $chunks[] = $chunkIndex;
            sort($chunks);
            $upload->uploaded_chunks = $chunks;
            $upload->save();
        }

        // Check if all chunks are now present
        $allChunksUploaded = count($chunks) >= $totalChunks;

        if ($allChunksUploaded) {
            // Idempotency: if merge already happened, skip
            if ($upload->final_path) {
                return response()->json([
                    'status' => 'uploaded',
                    'upload_uuid' => $uploadUuid,
                ], 200);
            }

            // Merge chunks into the final file
            $originalName = pathinfo($filename, PATHINFO_FILENAME);
            $extension = pathinfo($filename, PATHINFO_EXTENSION);
            $cleanFileName = Str::slug($originalName) . '_' . time() . '.' . $extension;

            $folder = $fileType === 'reel' ? 'reels' : 'videos';
            Storage::disk('public')->makeDirectory($folder);
            $destinationPath = Storage::disk('public')->path("{$folder}/{$cleanFileName}");

            $out = fopen($destinationPath, 'wb');
            if (!$out) {
                $upload->update(['status' => 'failed']);
                return response()->json(['error' => 'Failed to open destination file for merging'], 500);
            }

            for ($i = 0; $i < $totalChunks; $i++) {
                $chunkPath = Storage::disk('local')->path("tmp/{$uploadUuid}/chunk_{$i}");
                $in = fopen($chunkPath, 'rb');
                if ($in) {
                    while ($buff = fread($in, 4096)) {
                        fwrite($out, $buff);
                    }
                    fclose($in);
                } else {
                    fclose($out);
                    $upload->update(['status' => 'failed']);
                    return response()->json(['error' => "Failed to read chunk {$i} for merging"], 500);
                }
            }
            fclose($out);

            // Delete chunk directory
            Storage::disk('local')->deleteDirectory("tmp/{$uploadUuid}");

            // Update upload record with final path
            $upload->update([
                'final_path' => "{$folder}/{$cleanFileName}",
                'status' => 'uploaded',
            ]);

            return response()->json([
                'status' => 'uploaded',
                'upload_uuid' => $uploadUuid,
            ], 200);
        }

        // Intermediate chunk saved
        return response()->json([
            'status' => 'chunk_saved',
            'chunk_index' => $chunkIndex,
            'next_chunk' => $chunkIndex + 1,
        ], 200);
    }

    /**
     * Process a fully uploaded file: extract metadata, generate thumbnails (videos only), create DB record.
     *
     * Stage 2 of the 3-stage pipeline.
     * Idempotent: if the upload is already published, returns the existing model.
     *
     * IMPORTANT: Reels do NOT generate thumbnails — thumbnail_path is set to null.
     */
    public function processUpload(Request $request, $uploadUuid)
    {
        $upload = Upload::where('upload_uuid', $uploadUuid)->first();

        if (!$upload) {
            return response()->json(['error' => 'Upload session not found'], 404);
        }

        // Idempotent: if already published, return existing model
        if ($upload->status === 'published' && $upload->model_id) {
            if ($upload->file_type === 'reel') {
                $model = Reel::find($upload->model_id);
                return response()->json([
                    'message' => 'Already processed',
                    'reel' => $model,
                    'type' => 'reel',
                ], 200);
            } else {
                $model = Video::find($upload->model_id);
                return response()->json([
                    'message' => 'Already processed',
                    'video' => $model,
                    'type' => 'video',
                    'temp_thumbnails' => [],
                ], 200);
            }
        }

        if ($upload->status !== 'uploaded') {
            return response()->json([
                'error' => 'Upload is not ready for processing',
                'current_status' => $upload->status,
            ], 422);
        }

        // Mark as processing
        $upload->update(['status' => 'processing']);

        try {
            $absolutePath = Storage::disk('public')->path($upload->final_path);

            // Extract metadata
            $metadata = $this->videoService->getMetadata($absolutePath);

            $defaultTitle = $upload->title ?: self::formatTitleFromFilename($upload->file_name);

            if ($upload->file_type === 'video') {
                $model = Video::create([
                    'title' => $defaultTitle,
                    'description' => $upload->description,
                    'video_path' => Storage::url($upload->final_path),
                    'thumbnail_path' => null,
                    'duration' => $metadata['duration'],
                    'resolution' => $metadata['resolution'],
                    'status' => 'published',
                    'published_at' => now(),
                ]);

                // Generate single WebP thumbnail directly in the permanent location
                try {
                    $thumbnailUrl = $this->videoService->generateSingleThumbnail($absolutePath, $metadata['duration'], $model->id);
                    if ($thumbnailUrl) {
                        $model->update(['thumbnail_path' => $thumbnailUrl]);
                    }
                } catch (\Exception $e) {
                    Log::error("Failed to generate initial thumbnail for video {$model->id}: " . $e->getMessage());
                }

                $upload->update([
                    'status' => 'published',
                    'model_id' => $model->id,
                ]);

                $this->clearVideoCache();

                return response()->json([
                    'message' => 'Processing complete',
                    'video' => $model,
                    'type' => 'video',
                    'temp_thumbnails' => [],
                ], 201);

            } else {
                // Reel: NO thumbnail generation — thumbnails are not used for reels
                $model = Reel::create([
                    'title' => $defaultTitle,
                    'description' => $upload->description,
                    'video_path' => Storage::url($upload->final_path),
                    'thumbnail_path' => null,
                    'duration' => $metadata['duration'],
                    'resolution' => $metadata['resolution'],
                    'orientation' => $metadata['orientation'] ?? 'portrait',
                    'status' => 'published',
                    'published_at' => now(),
                ]);

                $upload->update([
                    'status' => 'published',
                    'model_id' => $model->id,
                ]);

                Cache::forget("reels_stream_list");
                Cache::forget("reels_stream_list_v2");

                return response()->json([
                    'message' => 'Processing complete',
                    'reel' => $model,
                    'type' => 'reel',
                ], 201);
            }
        } catch (\Exception $e) {
            Log::error("Upload processing failed for {$uploadUuid}: " . $e->getMessage());
            $upload->update(['status' => 'failed']);

            return response()->json([
                'error' => 'Processing failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Cancel an upload session.
     * Marks the upload as cancelled in the DB.
     * Chunk temp files and merged file are cleaned up by the CleanupStaleUploads command.
     */
    public function cancelUpload($uploadUuid)
    {
        $upload = Upload::where('upload_uuid', $uploadUuid)->first();

        if (!$upload) {
            return response()->json(['message' => 'Upload session not found'], 404);
        }

        // Don't cancel already-published uploads
        if ($upload->status === 'published') {
            return response()->json(['message' => 'Cannot cancel a published upload'], 409);
        }

        // Immediately clean up chunk temp directory if it exists
        $tempDir = "tmp/{$uploadUuid}";
        if (Storage::disk('local')->exists($tempDir)) {
            Storage::disk('local')->deleteDirectory($tempDir);
        }

        $upload->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Upload cancelled successfully']);
    }

    // ── Video CRUD ──────────────────────────────────────────────────────

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

    public function update(Request $request, $id)
    {
        $video = Video::findOrFail($id);

        $request->validate([
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'thumbnail_path' => 'nullable|string',
            'status' => 'required|in:draft,published',
        ]);

        // If title is empty, regenerate from current video title (keep existing)
        $title = $request->input('title') ?: $video->title;

        $newThumbUrl = $request->thumbnail_path;

        if ($newThumbUrl && str_contains($newThumbUrl, 'temp-thumbnails/')) {
            $pathParts = explode('temp-thumbnails/', $newThumbUrl);
            if (count($pathParts) === 2) {
                $filename = basename($pathParts[1]);
                $prefix = $this->videoService->getPrefixFromTempFilename($filename);

                // Delete old permanent thumbnail if it exists and is not temporary
                if ($video->thumbnail_path && !str_contains($video->thumbnail_path, 'temp-thumbnails/')) {
                    $this->videoService->deleteThumbnail($video->thumbnail_path);
                }

                // Finalize the chosen thumbnail (converts to WebP, deletes other temp files)
                try {
                    $newThumbUrl = $this->videoService->finalizeThumbnail($newThumbUrl, $video->id, $prefix);
                } catch (\Exception $e) {
                    Log::error("Failed to finalize video thumbnail on update: " . $e->getMessage());
                }
            }
        }

        $video->update([
            'title' => $title,
            'description' => $request->description,
            'thumbnail_path' => $newThumbUrl,
            'status' => $request->status,
        ]);

        // Clear targeted caches (both versioned keys)
        $this->clearVideoCache();
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
        $videoPath = ltrim(str_replace('/storage/', '', parse_url($video->video_path, PHP_URL_PATH)), '/');
        Storage::disk('public')->delete($videoPath);

        // Delete single active thumbnail
        if ($video->thumbnail_path) {
            $this->videoService->deleteThumbnail($video->thumbnail_path);
        }

        // Delete from DB
        $video->delete();

        // Clear targeted caches (both versioned keys)
        $this->clearVideoCache();
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
            $videoPath = ltrim(str_replace('/storage/', '', parse_url($video->video_path, PHP_URL_PATH)), '/');
            Storage::disk('public')->delete($videoPath);

            // Delete single active thumbnail
            if ($video->thumbnail_path) {
                $this->videoService->deleteThumbnail($video->thumbnail_path);
            }

            // Delete from DB
            $video->delete();
            Cache::forget("video_detail_{$video->id}_v2");
            Cache::forget("video_recommendations_{$video->id}_v2");
        }

        // Clear cache
        $this->clearVideoCache();

        return response()->json([
            'message' => 'Selected videos and files deleted successfully'
        ]);
    }

    public function regenerateThumbnails($id)
    {
        $video = Video::findOrFail($id);

        $videoPath = ltrim(str_replace('/storage/', '', parse_url($video->video_path, PHP_URL_PATH)), '/');
        $absolutePath = Storage::disk('public')->path($videoPath);

        if (!Storage::disk('public')->exists($videoPath)) {
            return response()->json(['error' => 'Video file not found'], 404);
        }

        $metadata = $this->videoService->getMetadata($absolutePath);
        $outputDirName = 'edit_' . $video->id . '_' . time();

        $thumbnails = $this->videoService->generateThumbnails($absolutePath, $metadata['duration'], $outputDirName, true);

        return response()->json([
            'temp_thumbnails' => $thumbnails
        ]);
    }

    public function cleanupTempDirectory(Request $request)
    {
        $request->validate([
            'prefix' => 'nullable|string',
            'dir_name' => 'nullable|string', // fallback for backwards compatibility
        ]);

        $prefix = $request->input('prefix') ?: $request->input('dir_name');

        if ($prefix) {
            $this->videoService->deleteTempThumbnailsByPrefix($prefix);
            return response()->json(['success' => true]);
        }

        return response()->json(['success' => false, 'message' => 'No prefix or directory name provided']);
    }

    private function clearVideoCache(): void
    {
        // Clear both old (v2) and current (v3) versioned homepage cache keys
        for ($i = 1; $i <= 20; $i++) {
            Cache::forget("homepage_videos_page_{$i}_v2");
            Cache::forget("homepage_videos_page_{$i}_v3");
        }
    }
}
