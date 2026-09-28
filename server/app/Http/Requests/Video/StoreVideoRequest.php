<?php

namespace App\Http\Requests\Video;

use Illuminate\Foundation\Http\FormRequest;

class StoreVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'video'       => ['required', 'file', 'mimes:mp4,mov,webm', 'max:512000'],
            'caption'     => ['nullable', 'string', 'max:2200'],
            'audio_id'    => ['nullable', 'integer', 'exists:audio_tracks,id'],
            'hashtags'    => ['nullable', 'array', 'max:30'],
            'hashtags.*'  => ['string', 'max:100'],
            'allow_comments'    => ['boolean'],
            'allow_duet'        => ['boolean'],
            'allow_stitch'      => ['boolean'],
            'visibility'        => ['in:public,followers,private'],
        ];
    }
}
