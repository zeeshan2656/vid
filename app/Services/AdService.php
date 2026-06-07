<?php

namespace App\Services;

use App\Models\Advertisement;
use Illuminate\Support\Facades\Cache;

class AdService
{
    private const CACHE_KEY = 'active_advertisements';
    private const CACHE_TTL = 86400; // 24 hours

    /**
     * Get all active advertisements from cache or DB
     */
    public function getActiveAds(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            return Advertisement::where('status', 'active')->get()->toArray();
        });
    }

    /**
     * Filter cached ads by placement and device
     */
    public function getAdForPlacement(string $placement, string $device): ?array
    {
        $allowedRowPlacements = [
            'homepage_row_1_ad',
            'homepage_row_2_ad',
            'homepage_row_3_ad',
            'homepage_row_4_ad',
            'homepage_row_5_ad',
            'homepage_default_ad'
        ];

        if (in_array($placement, $allowedRowPlacements)) {
            $ads = Cache::remember($placement, self::CACHE_TTL, function () use ($placement) {
                return Advertisement::where('status', 'active')
                    ->where('placement', $placement)
                    ->get()
                    ->toArray();
            });
        } else {
            $ads = $this->getActiveAds();
        }
        
        $filtered = array_filter($ads, function ($ad) use ($placement, $device) {
            $placementMatch = ($ad['placement'] === $placement);
            $deviceMatch = ($ad['target_device'] === 'both' || $ad['target_device'] === $device);
            return $placementMatch && $deviceMatch;
        });

        if (empty($filtered)) {
            return null;
        }

        // Return a random ad from the matching set to rotate ads
        return $filtered[array_rand($filtered)];
    }

    /**
     * Clear the advertisements cache
     */
    public function clearCache(): void
    {
        Cache::forget(self::CACHE_KEY);
        Cache::forget('homepage_row_1_ad');
        Cache::forget('homepage_row_2_ad');
        Cache::forget('homepage_row_3_ad');
        Cache::forget('homepage_row_4_ad');
        Cache::forget('homepage_row_5_ad');
        Cache::forget('homepage_default_ad');
    }
}
