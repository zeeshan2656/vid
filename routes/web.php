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
    } catch (\Exception $e) {
        return 'Error running migrations: ' . $e->getMessage();
    }
});

Route::get('/clear-cache', function () {
    try {
        \Illuminate\Support\Facades\Artisan::call('config:clear');
        \Illuminate\Support\Facades\Artisan::call('cache:clear');
        \Illuminate\Support\Facades\Artisan::call('view:clear');
        return 'Cache cleared successfully!';
    } catch (\Exception $e) {
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
    
    $reelsDir = $targetStorage . '/reels';
    $result['reels_dir_exists'] = file_exists($reelsDir);
    if (is_dir($reelsDir)) {
        $result['reels_files'] = array_slice(scandir($reelsDir), 0, 20);
    }
    
    if ($result['public_storage_exists']) {
        if (!$result['public_storage_is_link']) {
            $result['action_needed'] = 'public/storage is a real directory, not a link. It needs to be deleted or renamed, then storage:link run.';
        } else {
            $linkTarget = @readlink($publicStorage);
            $result['link_target'] = $linkTarget;
            if ($linkTarget && !file_exists($linkTarget)) {
                $result['action_needed'] = 'public/storage is a broken link pointing to a non-existent path: ' . $linkTarget;
            } else {
                $result['action_needed'] = 'Link seems correct and target exists.';
            }
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
    
    if (file_exists($publicStorage)) {
        if (is_link($publicStorage)) {
            $log[] = 'Found existing symlink. Deleting it...';
            if (@unlink($publicStorage)) {
                $log[] = 'Successfully deleted existing symlink.';
            } else {
                $log[] = 'Failed to delete existing symlink.';
            }
        } elseif (is_dir($publicStorage)) {
            $log[] = 'Found existing directory instead of symlink. Renaming it to storage_old...';
            $backupPath = public_path('storage_old_' . time());
            if (@rename($publicStorage, $backupPath)) {
                $log[] = 'Successfully renamed directory to ' . basename($backupPath);
            } else {
                $log[] = 'Failed to rename directory.';
            }
        } else {
            $log[] = 'Found unknown file type. Deleting it...';
            if (@unlink($publicStorage)) {
                $log[] = 'Successfully deleted unknown file.';
            } else {
                $log[] = 'Failed to delete unknown file.';
            }
        }
    }
    
    try {
        \Illuminate\Support\Facades\Artisan::call('storage:link');
        $log[] = 'Artisan storage:link output: ' . \Illuminate\Support\Facades\Artisan::output();
    } catch (\Exception $e) {
        $log[] = 'Artisan storage:link error: ' . $e->getMessage();
    }
    
    if (!file_exists($publicStorage)) {
        $log[] = 'Symlink still missing. Trying native PHP symlink()...';
        if (@symlink($targetStorage, $publicStorage)) {
            $log[] = 'Native symlink() created successfully.';
        } else {
            $log[] = 'Native symlink() failed.';
        }
    }
    
    return response()->json($log);
});

Route::get('/', function () {
    return view('welcome');
});

Route::fallback(function () {
    return view('welcome');
});
