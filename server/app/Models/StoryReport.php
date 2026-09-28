<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * story_reports existed as a table (StoryController::report()) with no
 * Eloquent model at all - every read of it happened through DB::table(),
 * which meant it could never be plugged into anything relation-based
 * (eager-loading the reporter/story for admin review, in particular).
 * This is the model, not a schema change.
 */
class StoryReport extends Model
{
    public $timestamps = false;
    protected $fillable = ['story_id', 'reporter_id', 'reason', 'evidence_keys', 'status', 'created_at'];

    protected function casts(): array
    {
        return ['evidence_keys' => 'array', 'created_at' => 'datetime'];
    }

    public function story()    { return $this->belongsTo(Story::class); }
    public function reporter() { return $this->belongsTo(User::class, 'reporter_id'); }
}
