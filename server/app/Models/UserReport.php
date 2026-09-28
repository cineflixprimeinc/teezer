<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserReport extends Model
{
    public $timestamps = false;
    protected $fillable = ['reported_user_id', 'reporter_id', 'reason', 'description', 'status', 'reviewed_by', 'reviewed_at'];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime'];
    }

    public function reportedUser() { return $this->belongsTo(User::class, 'reported_user_id'); }
    public function reporter()     { return $this->belongsTo(User::class, 'reporter_id'); }
    public function reviewer()     { return $this->belongsTo(User::class, 'reviewed_by'); }
}
