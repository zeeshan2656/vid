<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Upload extends Model
{
    protected $fillable = [
        'upload_uuid',
        'file_name',
        'file_type',
        'total_chunks',
        'uploaded_chunks',
        'status',
        'final_path',
        'title',
        'description',
        'model_id',
    ];

    protected $casts = [
        'uploaded_chunks' => 'array',
        'total_chunks' => 'integer',
        'model_id' => 'integer',
    ];
}
