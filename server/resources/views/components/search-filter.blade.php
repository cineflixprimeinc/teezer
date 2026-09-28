@props(['action' => '', 'placeholder' => 'Search...', 'value' => ''])

<form method="GET" action="{{ $action }}" class="flex gap-2">
    <input
        type="text"
        name="q"
        value="{{ $value }}"
        placeholder="{{ $placeholder }}"
        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#fd4605] transition-colors"
    >
    <x-action-btn type="submit" size="md">Search</x-action-btn>
</form>
