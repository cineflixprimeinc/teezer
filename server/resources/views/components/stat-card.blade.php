@props(['label', 'value', 'icon' => null, 'trend' => null, 'color' => 'pink'])

@php
    $colors = [
        'pink'  => 'text-[#fd4605]',
        'green' => 'text-green-400',
        'blue'  => 'text-blue-400',
        'amber' => 'text-amber-400',
    ];
    $colorClass = $colors[$color] ?? $colors['pink'];
@endphp

<div class="bg-[#111111] rounded-xl p-5 border border-white/5">
    <div class="flex items-start justify-between">
        <div>
            <p class="text-xs text-gray-400 uppercase tracking-wide">{{ $label }}</p>
            <p class="mt-1 text-2xl font-semibold text-white">{{ $value }}</p>
            @if($trend)
                <p class="mt-1 text-xs {{ $trend >= 0 ? 'text-green-400' : 'text-red-400' }}">
                    {{ $trend >= 0 ? '+' : '' }}{{ $trend }}% vs last week
                </p>
            @endif
        </div>
        @if($icon)
            <div class="text-2xl {{ $colorClass }}">{{ $icon }}</div>
        @endif
    </div>
</div>
