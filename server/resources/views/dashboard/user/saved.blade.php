@extends('layouts.user')

@section('title', 'Saved Videos')
@section('page_title', 'Saved Videos')

@section('content')
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <x-empty-state title="No saved videos" description="Videos you save from the app will appear here." icon="🔖" />
    </div>
@endsection
