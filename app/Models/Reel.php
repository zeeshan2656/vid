<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Reel extends Model
{
    protected $fillable = [
        'title',
        'description',
        'video_path',
        'thumbnail_path',
        'duration',
        'resolution',
        'orientation',
        'views',
        'likes',
        'status',
        'published_at',
    ];

    protected $casts = [
        'duration' => 'float',
        'views' => 'integer',
        'likes' => 'integer',
        'published_at' => 'datetime',
    ];

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class)->where('status', 'approved')->latest();
    }
}
