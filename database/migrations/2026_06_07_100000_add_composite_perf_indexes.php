<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add composite and targeted indexes for optimal query performance.
     *
     * Covers the most common query patterns:
     *   - Homepage: WHERE status = 'published' ORDER BY published_at DESC
     *   - Comments: WHERE video_id = ? AND status = 'approved'
     */
    public function up(): void
    {
        // videos: composite index for the primary homepage query
        Schema::table('videos', function (Blueprint $table) {
            // Covers: WHERE status = 'published' ORDER BY published_at DESC
            $table->index(['status', 'published_at'], 'videos_status_published_at_idx');
        });

        // reels: composite index for the reels stream query
        Schema::table('reels', function (Blueprint $table) {
            // Covers: WHERE status = 'published' ORDER BY published_at DESC
            $table->index(['status', 'published_at'], 'reels_status_published_at_idx');
        });

        // comments: composite indexes for fetching approved comments per entity
        Schema::table('comments', function (Blueprint $table) {
            $table->index(['video_id', 'status'], 'comments_video_id_status_idx');
            $table->index(['reel_id', 'status'], 'comments_reel_id_status_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex('videos_status_published_at_idx');
        });

        Schema::table('reels', function (Blueprint $table) {
            $table->dropIndex('reels_status_published_at_idx');
        });

        Schema::table('comments', function (Blueprint $table) {
            $table->dropIndex('comments_video_id_status_idx');
            $table->dropIndex('comments_reel_id_status_idx');
        });
    }
};
