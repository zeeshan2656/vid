<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('uploads', function (Blueprint $table) {
            $table->id();
            $table->string('upload_uuid')->unique()->index();
            $table->string('file_name');
            $table->string('file_type')->default('video'); // video or reel
            $table->integer('total_chunks')->default(1);
            $table->json('uploaded_chunks')->nullable(); // array of received chunk indices
            $table->string('status')->default('uploading')->index(); // uploading, uploaded, processing, published, failed
            $table->string('final_path')->nullable(); // set after merge
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->unsignedBigInteger('model_id')->nullable(); // Video or Reel ID after creation
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploads');
    }
};
