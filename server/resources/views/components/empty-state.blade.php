@props(['title', 'description' => null, 'icon' => '📭'])

<div class="flex flex-col items-center justify-center py-20 text-center">
    <span class="text-5xl">{{ $icon }}</span>
    <h3 class="mt-4 text-white font-semibold text-lg">{{ $title }}</h3>
    @if($description)
        <p class="mt-1 text-gray-400 text-sm max-w-xs">{{ $description }}</p>
    @endif
</div>
