<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminRolePermission extends Model
{
    public $timestamps = false;

    protected $fillable = ['role_id', 'permission'];

    public function role()
    {
        return $this->belongsTo(AdminRole::class, 'role_id');
    }
}
