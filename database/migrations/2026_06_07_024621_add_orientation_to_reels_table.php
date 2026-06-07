<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('reels', function (Blueprint $table) {
            $table->string('orientation')->default('portrait')->after('resolution')->index();
        });

        // Migrate existing reels data
        $reels = DB::table('reels')->get();
        foreach ($reels as $reel) {
            $orientation = 'portrait';
            if (!empty($reel->resolution) && $reel->resolution !== 'Unknown') {
                $parts = explode('x', $reel->resolution);
                if (count($parts) === 2) {
                    $width = (int)$parts[0];
                    $height = (int)$parts[1];
                    if ($width > $height) {
                        $orientation = 'landscape';
                    } elseif ($height > $width) {
                        $orientation = 'portrait';
                    } else {
                        $orientation = 'square';
                    }
                }
            }
            DB::table('reels')->where('id', $reel->id)->update(['orientation' => $orientation]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('reels', function (Blueprint $table) {
            $table->dropColumn('orientation');
        });
    }
};
