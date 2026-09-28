<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataDownloadRequest extends Model
{
    protected $fillable = ['user_id', 'status', 'completed_at'];

    protected $casts = ['completed_at' => 'datetime'];

    public function user() { return $this->belongsTo(User::class); }
}
