<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Advertisement extends Model
{
    protected $fillable = [
        'title',
        'type',
        'placement',
        'target_device',
        'image_path',
        'redirect_url',
        'ad_code',
        'status',
        'ad_duration',
        'media_type',
        'impressions',
        'clicks',
    ];

    protected $appends = ['ctr'];

    /**
     * Calculate Click-Through Rate (CTR) dynamically.
     */
    public function getCtrAttribute()
    {
        if ($this->impressions <= 0) {
            return 0.00;
        }
        return round(($this->clicks / $this->impressions) * 100, 2);
    }
}
