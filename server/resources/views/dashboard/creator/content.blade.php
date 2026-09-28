@extends('layouts.creator')

@section('title', 'My Content – Creator Studio')
@section('page_title', 'My Content')

@section('content')
    <div class="bg-[#111111] rounded-xl border border-white/5 overflow-hidden">
        <x-data-table :headers="['Video', 'Status', 'Views', 'Likes', 'Comments', 'Published', 'Actions']">
            <tr>
                <td colspan="7" class="px-4 py-12">
                    <x-empty-state title="No videos yet" description="Upload your first video from the mobile app to get started." icon="🎬" />
                </td>
            </tr>
        </x-data-table>
    </div>
@endsection
