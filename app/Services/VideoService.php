<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Exception;

class VideoService
{
    protected string $ffmpeg;
    protected string $ffprobe;

    public function __construct()
    {
        $this->ffmpeg = env('FFMPEG_BIN', 'ffmpeg');
        $this->ffprobe = env('FFPROBE_BIN', 'ffprobe');
    }

    /**
     * Get video metadata (duration & resolution)
     */
    public function getMetadata(string $filePath): array
    {
        $duration = 0;
        $resolution = 'Unknown';
        $orientation = 'portrait';

        try {
            // Get duration
            $durationCmd = sprintf(
                '"%s" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "%s"',
                $this->ffprobe,
                $filePath
            );
            $durationOutput = shell_exec($durationCmd);
            if ($durationOutput !== null) {
                $duration = (float) trim($durationOutput);
            }

            // Get resolution
            $resCmd = sprintf(
                '"%s" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "%s"',
                $this->ffprobe,
                $filePath
            );
            $resOutput = shell_exec($resCmd);
            if ($resOutput !== null) {
                $resolution = trim($resOutput);
            }

            // Get rotation to check if width/height need to be swapped
            $rotation = 0;
            $rotateCmd = sprintf(
                '"%s" -v error -select_streams v:0 -show_entries stream_tags=rotate -of default=noprint_wrappers=1:nokey=1 "%s"',
                $this->ffprobe,
                $filePath
            );
            $rotateOutput = shell_exec($rotateCmd);
            if ($rotateOutput !== null && trim($rotateOutput) !== '') {
                $rotation = (int) trim($rotateOutput);
            }

            if ($rotation === 0) {
                // Check side data rotation
                $sideCmd = sprintf(
                    '"%s" -v error -select_streams v:0 -show_entries stream_side_data=rotation -of default=noprint_wrappers=1:nokey=1 "%s"',
                    $this->ffprobe,
                    $filePath
                );
                $sideOutput = shell_exec($sideCmd);
                if ($sideOutput !== null && trim($sideOutput) !== '') {
                    $rotation = (int) trim($sideOutput);
                }
            }

            if ($resolution !== 'Unknown') {
                $parts = explode('x', $resolution);
                if (count($parts) === 2) {
                    $width = (int) $parts[0];
                    $height = (int) $parts[1];

                    // Swap width and height if rotated by 90 or 270 degrees
                    if (abs($rotation) === 90 || abs($rotation) === 270) {
                        $temp = $width;
                        $width = $height;
                        $height = $temp;
                    }

                    if ($width > $height) {
                        $orientation = 'landscape';
                    } elseif ($height > $width) {
                        $orientation = 'portrait';
                    } else {
                        $orientation = 'square';
                    }
                }
            }
        } catch (Exception $e) {
            Log::error("Failed to parse video metadata: " . $e->getMessage());
        }

        return [
            'duration' => $duration,
            'resolution' => $resolution,
            'orientation' => $orientation,
        ];
    }

    /**
     * Generate 5 thumbnails at 10%, 25%, 40%, 60%, 80% marks
     */
    public function generateThumbnails(string $videoPath, float $duration, string $outputDirName): array
    {
        $thumbnails = [];
        if ($duration <= 0) {
            $duration = 10; // default duration to fallback
        }

        // Percentage marks
        $marks = [0.10, 0.25, 0.40, 0.60, 0.80];
        
        // Ensure storage directory exists
        Storage::disk('public')->makeDirectory("thumbnails/{$outputDirName}");
        
        foreach ($marks as $index => $percentage) {
            $time = $duration * $percentage;
            $thumbName = "thumb_{$index}_" . time() . ".jpg";
            $relativePath = "thumbnails/{$outputDirName}/{$thumbName}";
            $absoluteOutputPath = Storage::disk('public')->path($relativePath);

            // FFmpeg command to capture frame
            $cmd = sprintf(
                '"%s" -y -ss %f -i "%s" -vframes 1 -f image2 "%s" 2>&1',
                $this->ffmpeg,
                $time,
                $videoPath,
                $absoluteOutputPath
            );

            $output = shell_exec($cmd);
            
            if (Storage::disk('public')->exists($relativePath)) {
                $thumbnails[] = Storage::url($relativePath);
            } else {
                Log::error("FFmpeg failed to generate thumbnail at {$time}s. Command: {$cmd}. Output: " . $output);
            }
        }

        return $thumbnails;
    }
}
