@props(['status'])

@php
    $map = [
        'active'    => 'bg-green-500/20 text-green-400',
        'banned'    => 'bg-red-500/20 text-red-400',
        'pending'   => 'bg-amber-500/20 text-amber-400',
        'approved'  => 'bg-green-500/20 text-green-400',
        'rejected'  => 'bg-red-500/20 text-red-400',
        'published' => 'bg-blue-500/20 text-blue-400',
        'draft'     => 'bg-gray-500/20 text-gray-400',
        'archived'  => 'bg-gray-500/20 text-gray-400',
        'removed'   => 'bg-red-500/20 text-red-400',
    ];
    $classes = $map[$status] ?? 'bg-gray-500/20 text-gray-400';
@endphp

<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {{ $classes }}">
    {{ ucfirst($status) }}
</span>
