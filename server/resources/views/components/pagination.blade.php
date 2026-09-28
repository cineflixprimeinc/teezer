@props(['paginator'])

@if($paginator->hasPages())
<nav class="flex justify-center gap-1 mt-6">
    {{-- Previous --}}
    @if($paginator->onFirstPage())
        <span class="px-3 py-1.5 text-sm rounded-lg bg-white/5 text-gray-600 cursor-not-allowed">&laquo;</span>
    @else
        <a href="{{ $paginator->previousPageUrl() }}" class="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition-colors">&laquo;</a>
    @endif

    {{-- Pages --}}
    @foreach($paginator->getUrlRange(max(1, $paginator->currentPage() - 2), min($paginator->lastPage(), $paginator->currentPage() + 2)) as $page => $url)
        @if($page == $paginator->currentPage())
            <span class="px-3 py-1.5 text-sm rounded-lg bg-[#fe2c55] text-white font-medium">{{ $page }}</span>
        @else
            <a href="{{ $url }}" class="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition-colors">{{ $page }}</a>
        @endif
    @endforeach

    {{-- Next --}}
    @if($paginator->hasMorePages())
        <a href="{{ $paginator->nextPageUrl() }}" class="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition-colors">&raquo;</a>
    @else
        <span class="px-3 py-1.5 text-sm rounded-lg bg-white/5 text-gray-600 cursor-not-allowed">&raquo;</span>
    @endif
</nav>
@endif
