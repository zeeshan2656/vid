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

        Route::post('/videos/bulk-delete', [AdminVideoController::class, 'bulkDestroy']);
        Route::post('/reels/bulk-delete', [AdminReelController::class, 'bulkDestroy']);

        Route::apiResource('/videos', AdminVideoController::class)->except(['create', 'edit']);
        Route::apiResource('/reels', AdminReelController::class)->except(['create', 'edit']);
        Route::apiResource('/ads', AdminAdController::class)->except(['create', 'edit']);
        
        Route::get('/settings', [AdminSettingController::class, 'index']);
        Route::post('/settings', [AdminSettingController::class, 'update']);
        
        Route::delete('/comments/{id}', [CommentController::class, 'destroy']);
    });
});

Route::get('/', function () {
    return view('welcome');
});

Route::fallback(function () {
    return view('welcome');
});
