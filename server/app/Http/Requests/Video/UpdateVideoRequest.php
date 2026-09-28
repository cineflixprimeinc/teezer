<?php

namespace App\Http\Requests\Video;

use Illuminate\Foundation\Http\FormRequest;

class UpdateVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'caption'           => ['nullable', 'string', 'max:2200'],
            'hashtags'          => ['nullable', 'array', 'max:30'],
            'hashtags.*'        => ['string', 'max:100'],
            'allow_comments'    => ['boolean'],
            'allow_duet'        => ['boolean'],
            'allow_stitch'      => ['boolean'],
            'visibility'        => ['in:public,followers,private'],
        ];
    }
}
