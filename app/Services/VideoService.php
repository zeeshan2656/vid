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
     * Generate 5 temporary thumbnails directly in temp-thumbnails/
     */
    public function generateThumbnails(string $videoPath, float $duration, string $prefix): array
    {
        $thumbnails = [];
        if ($duration <= 0) {
            $duration = 10; // default duration to fallback
        }

        // Percentage marks (10 marks)
        $marks = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
        
        // Ensure storage directory exists
        Storage::disk('public')->makeDirectory('temp-thumbnails');
        
        foreach ($marks as $index => $percentage) {
            $time = $duration * $percentage;
            $thumbName = "{$prefix}_{$index}_" . time() . ".jpg";
            $relativePath = "temp-thumbnails/{$thumbName}";
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

    /**
     * Generate a single thumbnail directly in the permanent location
     */
    public function generateSingleThumbnail(string $videoPath, float $duration, int $videoId): ?string
    {
        $time = $duration > 0 ? $duration * 0.05 : 1.0;
        
        // Ensure permanent directory exists
        Storage::disk('public')->makeDirectory('thumbnails');
        
        $permanentRelativePath = "thumbnails/video_{$videoId}.webp";
        $absolutePermanentPath = Storage::disk('public')->path($permanentRelativePath);
        
        // Generate a unique temporary jpg path in storage/app/public/temp-thumbnails
        Storage::disk('public')->makeDirectory('temp-thumbnails');
        $tempJpgName = "single_temp_" . $videoId . "_" . time() . "_" . uniqid() . ".jpg";
        $tempJpgRelative = "temp-thumbnails/{$tempJpgName}";
        $absoluteTempJpg = Storage::disk('public')->path($tempJpgRelative);

        // FFmpeg command to capture frame
        $cmd = sprintf(
            '"%s" -y -ss %f -i "%s" -vframes 1 -f image2 "%s" 2>&1',
            $this->ffmpeg,
            $time,
            $videoPath,
            $absoluteTempJpg
        );

        $output = shell_exec($cmd);

        if (Storage::disk('public')->exists($tempJpgRelative)) {
            // Convert to WebP
            $success = $this->convertToWebP($absoluteTempJpg, $absolutePermanentPath);
            // Delete temp jpg file
            Storage::disk('public')->delete($tempJpgRelative);
            
            return Storage::url($permanentRelativePath);
        } else {
            Log::error("FFmpeg failed to generate single thumbnail at {$time}s. Command: {$cmd}. Output: " . $output);
            return null;
        }
    }

    /**
     * Convert an image to WebP using GD library
     */
    public function convertToWebP(string $sourcePath, string $destinationPath, int $quality = 80): bool
    {
        $info = @getimagesize($sourcePath);
        if ($info === false) {
            return false;
        }

        $mime = $info['mime'];
        switch ($mime) {
            case 'image/jpeg':
                $image = @imagecreatefromjpeg($sourcePath);
                break;
            case 'image/png':
                $image = @imagecreatefrompng($sourcePath);
                break;
            case 'image/gif':
                $image = @imagecreatefromgif($sourcePath);
                break;
            default:
                return false;
        }

        if (!$image) {
            return false;
        }

        // Save as WebP
        $result = imagewebp($image, $destinationPath, $quality);
        imagedestroy($image);

        return $result;
    }

    /**
     * Get prefix from a temporary thumbnail filename
     */
    public function getPrefixFromTempFilename(string $filename): string
    {
        $parts = explode('_', basename($filename));
        if (count($parts) >= 3) {
            array_pop($parts); // removes timestamp.jpg
            array_pop($parts); // removes index
            return implode('_', $parts);
        }
        return '';
    }

    /**
     * Delete all temporary thumbnails starting with a given prefix
     */
    public function deleteTempThumbnailsByPrefix(string $prefix): void
    {
        if (empty($prefix)) {
            return;
        }

        $files = Storage::disk('public')->files('temp-thumbnails');
        foreach ($files as $file) {
            $filename = basename($file);
            if (\Illuminate\Support\Str::startsWith($filename, $prefix)) {
                Storage::disk('public')->delete($file);
            }
        }
    }

    /**
     * Finalize the selected temporary thumbnail:
     * - Convert it to WebP format
     * - Save it directly to storage/app/public/thumbnails/video_{id}.webp
     * - Delete all temporary thumbnails matching the prefix
     */
    public function finalizeThumbnail(string $tempUrl, int $videoId, string $prefix): string
    {
        $relativeTempPath = ltrim(str_replace('/storage/', '', parse_url($tempUrl, PHP_URL_PATH)), '/');
        
        if (!Storage::disk('public')->exists($relativeTempPath)) {
            throw new Exception("Temporary thumbnail not found at: {$relativeTempPath}");
        }

        $absoluteTempPath = Storage::disk('public')->path($relativeTempPath);
        
        // Ensure permanent directory exists
        Storage::disk('public')->makeDirectory('thumbnails');
        
        $permanentRelativePath = "thumbnails/video_{$videoId}.webp";
        $absolutePermanentPath = Storage::disk('public')->path($permanentRelativePath);

        // Convert the chosen temporary thumbnail to WebP
        $success = $this->convertToWebP($absoluteTempPath, $absolutePermanentPath);
        if (!$success) {
            // Fallback: Copy if WebP conversion failed
            Storage::disk('public')->copy($relativeTempPath, $permanentRelativePath);
        }

        // Delete all temporary thumbnails matching the prefix
        $this->deleteTempThumbnailsByPrefix($prefix);

        return Storage::url($permanentRelativePath);
    }

    /**
     * Delete the currently active thumbnail file
     */
    public function deleteThumbnail(string $url): void
    {
        $relativePath = ltrim(str_replace('/storage/', '', parse_url($url, PHP_URL_PATH)), '/');
        
        if (Storage::disk('public')->exists($relativePath)) {
            Storage::disk('public')->delete($relativePath);
        }
    }
}
