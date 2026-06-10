<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Admin\AuthController;
use App\Http\Controllers\Admin\VideoController as AdminVideoController;
use App\Http\Controllers\Admin\ReelController as AdminReelController;
use App\Http\Controllers\Admin\AdController as AdminAdController;
use App\Http\Controllers\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\VideoController;
use App\Http\Controllers\ReelController;
use App\Http\Controllers\CommentController;

Route::prefix('api')->group(function () {
    // User routes
    Route::get('/videos', [VideoController::class, 'index']);
    Route::get('/videos/{id}', [VideoController::class, 'show']);
    Route::post('/videos/{id}/view', [VideoController::class, 'incrementViews']);
    Route::post('/ads/{id}/impression', [VideoController::class, 'trackAdImpression']);
    Route::post('/ads/{id}/click', [VideoController::class, 'trackAdClick']);
    Route::get('/ads/footer', [VideoController::class, 'getFooterAd']);
    Route::get('/stream/videos/{filename}', [VideoController::class, 'stream'])->where('filename', '.*');

    Route::get('/reels', [ReelController::class, 'index']);
    Route::get('/reels/overlay-ad', [ReelController::class, 'getOverlayAd']);
    Route::get('/reels/{id}', [ReelController::class, 'show']);
    Route::post('/reels/{id}/view', [ReelController::class, 'incrementViews']);
    Route::post('/reels/{id}/like', [ReelController::class, 'toggleLike']);

    Route::post('/comments', [CommentController::class, 'store'])->middleware('throttle:5,1');

    // Admin Auth
    Route::post('/admin/login', [AuthController::class, 'login']);
    Route::post('/admin/logout', [AuthController::class, 'logout']);
    Route::get('/admin/status', [AuthController::class, 'status']);

    // Admin Protected Routes
    Route::middleware('auth')->prefix('admin')->group(function () {
        Route::get('/uploads/chunk/status', [AdminVideoController::class, 'getChunkStatus']);
        Route::post('/uploads/chunk', [AdminVideoController::class, 'uploadChunk']);
        Route::post('/uploads/{uploadUuid}/process', [AdminVideoController::class, 'processUpload']);
        Route::delete('/uploads/{uploadUuid}/cancel', [AdminVideoController::class, 'cancelUpload']);

        Route::post('/videos/bulk-delete', [AdminVideoController::class, 'bulkDestroy']);
        Route::post('/reels/bulk-delete', [AdminReelController::class, 'bulkDestroy']);

        Route::post('/videos/{id}/regenerate-thumbnails', [AdminVideoController::class, 'regenerateThumbnails']);
        Route::post('/videos/cleanup-temp-thumbnails', [AdminVideoController::class, 'cleanupTempDirectory']);
        Route::apiResource('/videos', AdminVideoController::class)->except(['create', 'edit']);
        Route::apiResource('/reels', AdminReelController::class)->except(['create', 'edit']);
        Route::apiResource('/ads', AdminAdController::class)->except(['create', 'edit']);
        
        Route::get('/settings', [AdminSettingController::class, 'index']);
        Route::post('/settings', [AdminSettingController::class, 'update']);
        
        Route::delete('/comments/{id}', [CommentController::class, 'destroy']);
    });
});

Route::get('/run-migrations', function () {
    try {
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        return 'Migrations run successfully:<br><pre>' . \Illuminate\Support\Facades\Artisan::output() . '</pre>';
    } catch (\Throwable $e) {
        return 'Error running migrations: ' . $e->getMessage();
    }
});

Route::get('/clear-cache', function () {
    try {
        \Illuminate\Support\Facades\Artisan::call('config:clear');
        \Illuminate\Support\Facades\Artisan::call('cache:clear');
        \Illuminate\Support\Facades\Artisan::call('view:clear');
        return 'Cache cleared successfully!';
    } catch (\Throwable $e) {
        return 'Error clearing cache: ' . $e->getMessage();
    }
});

Route::get('/check-storage', function () {
    $result = [];
    $publicStorage = public_path('storage');
    $targetStorage = storage_path('app/public');
    
    $result['public_storage_path'] = $publicStorage;
    $result['public_storage_exists'] = file_exists($publicStorage);
    $result['public_storage_is_link'] = is_link($publicStorage);
    $result['public_storage_is_dir'] = is_dir($publicStorage);
    
    $result['target_storage_path'] = $targetStorage;
    $result['target_storage_exists'] = file_exists($targetStorage);
    $result['target_storage_is_dir'] = is_dir($targetStorage);
    
    // Check reels under public/storage/reels
    $reelsDir = $publicStorage . '/reels';
    $result['public_reels_dir_exists'] = file_exists($reelsDir);
    if (is_dir($reelsDir)) {
        $result['public_reels_files'] = array_slice(scandir($reelsDir), 0, 20);
    }
    
    // Check reels under storage/app/public/reels (for debugging)
    $targetReelsDir = $targetStorage . '/reels';
    $result['private_reels_dir_exists'] = file_exists($targetReelsDir);
    if (is_dir($targetReelsDir)) {
        $result['private_reels_files'] = array_slice(scandir($targetReelsDir), 0, 20);
    }
    
    if ($result['public_storage_exists']) {
        if (!$result['public_storage_is_link']) {
            $result['action_needed'] = 'public/storage is a real directory (which is correct for Hostinger workaround!).';
        } else {
            $result['action_needed'] = 'public/storage is still a symbolic link. Run /fix-storage to convert it to a real directory.';
        }
    } else {
        $result['action_needed'] = 'public/storage does not exist. Run /fix-storage.';
    }
    
    return response()->json($result);
});

Route::get('/fix-storage', function () {
    $publicStorage = public_path('storage');
    $targetStorage = storage_path('app/public');
    $log = [];
    
    // 1. Delete any existing symlink or file at public/storage
    if (is_link($publicStorage) || file_exists($publicStorage)) {
        if (is_link($publicStorage)) {
            $log[] = 'Found existing symlink at public/storage. Deleting it...';
            if (@unlink($publicStorage)) {
                $log[] = 'Successfully deleted existing symlink.';
            } else {
                $log[] = 'Failed to delete existing symlink.';
            }
        } elseif (is_dir($publicStorage)) {
            $log[] = 'public/storage is already a real directory. Keeping it.';
        } else {
            $log[] = 'Found unknown file type at public/storage. Deleting it...';
            if (@unlink($publicStorage)) {
                $log[] = 'Successfully deleted unknown file.';
            } else {
                $log[] = 'Failed to delete unknown file.';
            }
        }
    }
    
    // 2. Create public/storage as a real directory if it doesn't exist
    if (!file_exists($publicStorage)) {
        $log[] = 'Creating public/storage as a real physical directory...';
        if (@mkdir($publicStorage, 0755, true)) {
            $log[] = 'Successfully created public/storage directory!';
        } else {
            $log[] = 'Failed to create public/storage directory.';
        }
    }
    
    // 3. Copy files from storage/app/public to public/storage recursively
    $log[] = 'Copying existing assets from storage/app/public to public/storage...';
    $copyDir = function($srcDir, $destDir) use (&$copyDir, &$log) {
        $dir = @opendir($srcDir);
        if (!$dir) return;
        @mkdir($destDir, 0755, true);
        while (($file = readdir($dir)) !== false) {
            if ($file === '.' || $file === '..') continue;
            $srcFile = $srcDir . '/' . $file;
            $destFile = $destDir . '/' . $file;
            if (is_dir($srcFile)) {
                $copyDir($srcFile, $destFile);
            } else {
                if (@copy($srcFile, $destFile)) {
                    $log[] = "Copied file: " . basename($srcFile);
                } else {
                    $log[] = "Failed to copy file: " . basename($srcFile);
                }
            }
        }
        closedir($dir);
    };

    if (file_exists($targetStorage) && is_dir($targetStorage)) {
        $copyDir($targetStorage, $publicStorage);
        $log[] = 'Asset copy process completed.';
    } else {
        $log[] = 'Source directory storage/app/public does not exist or is not a directory.';
    }
    
    return response()->json($log);
});

Route::get('/find-files', function () {
    $results = [];
    $find = function($dir) use (&$find, &$results) {
        if (!is_dir($dir)) return;
        $files = @scandir($dir);
        if (!$files) return;
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') continue;
            // Skip large vendor, node_modules or storage/framework dirs to avoid memory/time limit
            if ($file === 'vendor' || $file === 'node_modules' || $file === 'framework' || $file === '.git') continue;
            $path = $dir . '/' . $file;
            if (is_dir($path)) {
                $find($path);
            } else {
                if (str_contains($file, 'myshot') || str_contains($file, '.mp4')) {
                    $results[] = $path;
                }
            }
        }
    };
    
    $find(base_path());
    
    return response()->json([
        'base_path' => base_path(),
        'found_files' => $results,
        'public_storage_contents' => is_dir(public_path('storage')) ? @scandir(public_path('storage')) : 'not a dir',
        'app_public_contents' => is_dir(storage_path('app/public')) ? @scandir(storage_path('app/public')) : 'not a dir',
    ]);
});

Route::get('/', function () {
    return view('welcome');
});

Route::fallback(function () {
    return view('welcome');
});
