<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Setting;
use App\Services\SettingService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Artisan;

class SettingController extends Controller
{
    public function index()
    {
        // Return all settings — used by admin panel forms
        $settings = Setting::all()->pluck('value', 'key');
        return response()->json($settings);
    }

    public function update(Request $request)
    {
        $request->validate([
            'settings' => 'required|array',
        ]);

        foreach ($request->settings as $key => $value) {
            Setting::setVal($key, $value);
        }

        // Clear only settings-related caches — do NOT flush all caches
        // (flushing all caches would destroy video/reel/ad caches unnecessarily)
        SettingService::clearCache();

        // Clear Blade view cache so injected scripts update
        try {
            Artisan::call('view:clear');
        } catch (\Exception $e) {
            Log::warning('view:clear failed: ' . $e->getMessage());
        }

        return response()->json([
            'message'  => 'Settings updated successfully',
            'settings' => Setting::all()->pluck('value', 'key'),
        ]);
    }
}
