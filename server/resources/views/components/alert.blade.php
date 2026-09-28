@props(['type' => 'success', 'message'])

@php
    $map = [
        'success' => 'bg-green-500/10 border-green-500/30 text-green-400',
        'error'   => 'bg-red-500/10 border-red-500/30 text-red-400',
        'warning' => 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        'info'    => 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    ];
    $classes = $map[$type] ?? $map['info'];
@endphp

<div class="rounded-lg border px-4 py-3 text-sm {{ $classes }}" x-data x-init="setTimeout(() => $el.remove(), 4000)">
    {{ $message }}
</div>
