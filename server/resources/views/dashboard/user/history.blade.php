@extends('layouts.user')

@section('title', 'Watch History')
@section('page_title', 'Watch History')

@section('content')
    <div class="space-y-3">
        <x-empty-state title="No watch history" description="Videos you watch in the app will be tracked here." icon="🕐" />
    </div>
@endsection
