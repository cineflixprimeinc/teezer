@props(['variant' => 'primary', 'size' => 'sm', 'type' => 'button'])

@php
    $variants = [
        'primary'  => 'bg-[#fe2c55] hover:bg-[#e0264c] text-white',
        'danger'   => 'bg-red-600 hover:bg-red-700 text-white',
        'success'  => 'bg-green-600 hover:bg-green-700 text-white',
        'ghost'    => 'bg-white/5 hover:bg-white/10 text-gray-300',
    ];
    $sizes = [
        'sm' => 'px-3 py-1.5 text-xs',
        'md' => 'px-4 py-2 text-sm',
    ];
    $classes = ($variants[$variant] ?? $variants['primary']) . ' ' . ($sizes[$size] ?? $sizes['sm']);
@endphp

<button type="{{ $type }}" {{ $attributes->merge(['class' => "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors $classes"]) }}>
    {{ $slot }}
</button>
