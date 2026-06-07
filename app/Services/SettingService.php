<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

class SettingService
{
    private const CACHE_KEY = 'site_settings';
    private const CACHE_TTL = 3600; // 1 hour

    /**
     * Get all site settings from cache (single DB query when cold).
     */
    public static function getAll(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            return Setting::all()->pluck('value', 'key')->toArray();
        });
    }

    /**
     * Get a single setting value with optional default.
     */
    public static function get(string $key, string $default = ''): string
    {
        $settings = self::getAll();
        return $settings[$key] ?? $default;
    }

    /**
     * Clear the settings cache (call after saving settings).
     */
    public static function clearCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
