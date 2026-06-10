<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use App\Models\Video;
use App\Models\Upload;

class CleanupTempThumbnails extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:cleanup-temp-thumbnails';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clean up temporary thumbnail files older than 24 hours and stale upload sessions';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Starting temporary thumbnail cleanup...');
        
        // 1. Automatically choose Thumbnail 1 for any videos created > 24 hours ago that are still pointing to temp-thumbnails
        $oldVideos = Video::where('thumbnail_path', 'like', '%/temp-thumbnails/%')
            ->where('created_at', '<', Carbon::now()->subHours(24))
            ->get();
            
        foreach ($oldVideos as $video) {
            $this->info("Finalizing thumbnail automatically for Video ID: {$video->id}");
            try {
                $newThumbUrl = $video->thumbnail_path;
                $pathParts = explode('temp-thumbnails/', $newThumbUrl);
                if (count($pathParts) === 2) {
                    $filename = basename($pathParts[1]);
                    $videoService = resolve(\App\Services\VideoService::class);
                    $prefix = $videoService->getPrefixFromTempFilename($filename);
                    
                    // Call finalizeThumbnail to copy/convert Thumbnail 1 to permanent storage and clean up others
                    $finalUrl = $videoService->finalizeThumbnail($newThumbUrl, $video->id, $prefix);
                        
                    $video->update(['thumbnail_path' => $finalUrl]);
                    $this->info("Successfully finalized Video ID: {$video->id} to URL: {$finalUrl}");
                }
            } catch (\Exception $e) {
                Log::error("Failed to automatically finalize video {$video->id} thumbnail: " . $e->getMessage());
                $this->error("Error: " . $e->getMessage());
            }
        }

        // 2. Clean up files in public disk under temp-thumbnails/ older than 24 hours
        $tempDir = 'temp-thumbnails';
        if (Storage::disk('public')->exists($tempDir)) {
            $files = Storage::disk('public')->files($tempDir);
            $now = time();
            $twentyFourHoursAgo = $now - (24 * 3600);
            
            foreach ($files as $file) {
                if (basename($file) === '.gitignore') {
                    continue;
                }
                
                $mtime = Storage::disk('public')->lastModified($file);
                if ($mtime < $twentyFourHoursAgo) {
                    $this->info("Deleting temporary thumbnail file: {$file}");
                    Storage::disk('public')->delete($file);
                }
            }
        }

        // 3. Clean up stale upload sessions (stuck in 'uploading' for > 48 hours)
        $this->info('Cleaning up stale upload sessions...');
        $staleUploads = Upload::where('status', 'uploading')
            ->where('created_at', '<', Carbon::now()->subHours(48))
            ->get();

        foreach ($staleUploads as $upload) {
            $this->info("Cleaning stale upload: {$upload->upload_uuid} ({$upload->file_name})");

            // Delete chunk directory if it still exists
            $chunkDir = "tmp/{$upload->upload_uuid}";
            if (Storage::disk('local')->exists($chunkDir)) {
                Storage::disk('local')->deleteDirectory($chunkDir);
                $this->info("  Deleted chunk directory: {$chunkDir}");
            }

            // Delete the upload record
            $upload->delete();
        }

        if ($staleUploads->count() > 0) {
            $this->info("Cleaned up {$staleUploads->count()} stale upload session(s).");
        }
        
        $this->info('Temporary thumbnail cleanup completed.');
    }
}
