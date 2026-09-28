@props(['id', 'title' => 'Confirm Action', 'message' => 'Are you sure?', 'action', 'method' => 'POST', 'confirmLabel' => 'Confirm', 'confirmVariant' => 'danger'])

<div x-data="{ open: false }" x-on:open-modal-{{ $id }}.window="open = true">
    <div x-show="open" x-cloak class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div class="bg-[#111111] border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4" @click.outside="open = false">
            <h3 class="text-white font-semibold text-lg">{{ $title }}</h3>
            <p class="mt-2 text-gray-400 text-sm">{{ $message }}</p>
            <div class="mt-5 flex justify-end gap-3">
                <button type="button" @click="open = false"
                    class="px-4 py-2 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">
                    Cancel
                </button>
                <form action="{{ $action }}" method="POST">
                    @csrf
                    @if(!in_array(strtoupper($method), ['GET','POST']))
                        @method($method)
                    @endif
                    <x-action-btn type="submit" variant="{{ $confirmVariant }}">{{ $confirmLabel }}</x-action-btn>
                </form>
            </div>
        </div>
    </div>
</div>
