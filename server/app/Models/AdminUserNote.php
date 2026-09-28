<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminUserNote extends Model
{
    protected $fillable = ['user_id', 'admin_id', 'note'];

    public function user()  { return $this->belongsTo(User::class, 'user_id'); }
    public function admin() { return $this->belongsTo(User::class, 'admin_id'); }
}
