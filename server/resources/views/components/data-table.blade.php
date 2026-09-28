@props(['headers' => []])

<div class="overflow-x-auto">
    <table class="w-full text-sm text-left">
        <thead>
            <tr class="border-b border-white/10">
                @foreach($headers as $header)
                    <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{{ $header }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
            {{ $slot }}
        </tbody>
    </table>
</div>
