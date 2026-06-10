<?php

namespace App\Console\Commands;

use App\Models\Upload;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CleanupStaleUploads extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'uploads:cleanup
                            {--hours=24 : Delete uploads older than this many hours}
                            {--dry-run : Preview what would be deleted without actually deleting}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Remove stale/abandoned/cancelled upload records and their temp files older than N hours';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $hours    = (int) $this->option('hours');
        $isDryRun = $this->option('dry-run');
        $cutoff   = now()->subHours($hours);

        $staleStatuses = ['uploading', 'failed', 'cancelled'];

        $staleUploads = Upload::whereIn('status', $staleStatuses)
            ->where('updated_at', '<', $cutoff)
            ->get();

        if ($staleUploads->isEmpty()) {
            $this->info('No stale uploads found.');
            return self::SUCCESS;
        }

        $this->info("Found {$staleUploads->count()} stale upload(s) older than {$hours} hour(s).");

        if ($isDryRun) {
            $this->warn('[DRY RUN] The following records would be deleted:');
        }

        $deletedCount = 0;
        $freedBytes   = 0;

        foreach ($staleUploads as $upload) {
            $label = "[#{$upload->id}] UUID={$upload->upload_uuid} status={$upload->status} updated={$upload->updated_at}";

            if ($isDryRun) {
                $this->line("  • {$label}");
                continue;
            }

            try {
                // 1. Delete chunk temp directory (storage/app/tmp/{uuid}/)
                $tempDir = "tmp/{$upload->upload_uuid}";
                if (Storage::disk('local')->exists($tempDir)) {
                    Storage::disk('local')->deleteDirectory($tempDir);
                    $this->line("  Deleted temp dir: {$tempDir}");
                }

                // 2. Delete merged file if it exists (storage/app/public/videos/ or reels/)
                if ($upload->final_path && Storage::disk('public')->exists($upload->final_path)) {
                    $size = Storage::disk('public')->size($upload->final_path);
                    $freedBytes += $size;
                    Storage::disk('public')->delete($upload->final_path);
                    $this->line("  Deleted merged file: {$upload->final_path} (" . number_format($size / 1048576, 2) . " MB)");
                }

                // 3. Delete the upload DB record
                $upload->delete();
                $deletedCount++;
                $this->line("  Deleted DB record: {$label}");

            } catch (\Exception $e) {
                Log::error("CleanupStaleUploads: Failed to clean upload #{$upload->id}: " . $e->getMessage());
                $this->error("  Failed to clean #{$upload->id}: " . $e->getMessage());
            }
        }

        if (!$isDryRun) {
            $mbFreed = number_format($freedBytes / 1048576, 2);
            $this->info("Cleanup complete. Deleted {$deletedCount} record(s), freed {$mbFreed} MB.");
            Log::info("CleanupStaleUploads: Deleted {$deletedCount} stale upload(s), freed {$mbFreed} MB.");
        }

        return self::SUCCESS;
    }
}
