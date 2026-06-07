<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('advertisements', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('type')->default('banner'); // banner, popup, native
            $table->string('placement')->index(); // home_top, video_sidebar, etc.
            $table->string('target_device')->default('both')->index(); // desktop, mobile, both
            $table->string('image_path')->nullable();
            $table->string('redirect_url')->nullable();
            $table->text('ad_code')->nullable();
            $table->string('status')->default('active')->index(); // active, inactive
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('advertisements');
    }
};
