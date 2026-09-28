@extends('layouts.creator')

@section('title', 'Verification – Creator Studio')
@section('page_title', 'Verification')

@section('content')
    @if(session('success'))
        <x-alert type="success" :message="session('success')" class="mb-4" />
    @endif

    <div class="max-w-lg bg-[#111111] rounded-xl border border-white/5 p-6">
        <h2 class="text-white font-semibold mb-1">Apply for Verification</h2>
        <p class="text-gray-400 text-sm mb-5">Get the verified badge by submitting your application below.</p>

        <form action="{{ route('creator.verification.apply') }}" method="POST" class="space-y-4">
            @csrf
            <div>
                <label class="block text-xs text-gray-400 mb-1">Category</label>
                <select name="category" class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#fd4605]">
                    <option value="creator">Content Creator</option>
                    <option value="business">Business</option>
                    <option value="celebrity">Celebrity / Public Figure</option>
                </select>
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Document URL</label>
                <input type="url" name="document_url" placeholder="https://..."
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#fd4605]">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Why should you be verified?</label>
                <textarea name="reason" rows="4" maxlength="1000"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#fd4605] resize-none"></textarea>
            </div>
            <x-action-btn type="submit" size="md">Submit Application</x-action-btn>
        </form>
    </div>
@endsection
