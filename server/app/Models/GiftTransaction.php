<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GiftTransaction extends Model
{
    public $timestamps = false;
    protected $fillable = ['gift_id', 'sender_id', 'receiver_id', 'video_id', 'quantity', 'total_coins'];

    public function gift()     { return $this->belongsTo(Gift::class); }
    public function sender()   { return $this->belongsTo(User::class, 'sender_id'); }
    public function receiver() { return $this->belongsTo(User::class, 'receiver_id'); }
    public function video()    { return $this->belongsTo(Video::class); }
}
