@props(['role'])

@php
    $map = [
        'admin'   => 'bg-[#fe2c55]/20 text-[#fe2c55]',
        'creator' => 'bg-purple-500/20 text-purple-400',
        'user'    => 'bg-gray-500/20 text-gray-400',
    ];
    $classes = $map[$role] ?? 'bg-gray-500/20 text-gray-400';
@endphp

<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {{ $classes }}">
    {{ ucfirst($role) }}
</span>
