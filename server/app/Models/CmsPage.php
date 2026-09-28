<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CmsPage extends Model
{
    protected $fillable = [
        'slug', 'title', 'content', 'meta_title', 'meta_description',
        'is_published', 'locale', 'updated_by',
    ];

    protected $casts = ['is_published' => 'boolean'];
}
