<?php

namespace App\Mail;

use App\Models\MonetizationProgram;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "The thing you asked to be told about is now open."
 *
 * Queued rather than sent inline: this goes out to a whole waitlist at once
 * when an admin opens a program, and doing that on the request thread would
 * hold the admin's own response open for as long as the list is.
 */
class MonetizationAvailableMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly MonetizationProgram $program,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: sprintf('%s is now available on Teezer', $this->program->label),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.monetization_available',
            with: [
                'name'        => $this->user->name ?: $this->user->username,
                'label'       => $this->program->label,
                'description' => $this->program->description,
                'cta'         => $this->program->cta_label ?: 'Open monetization',
                // One destination for every program: the monetization page
                // lists them all and knows each one's own next step, so there
                // is no per-program URL to keep in step with the catalog.
                'url'         => rtrim((string) config('app.frontend_url', 'https://teezer.live'), '/')
                                 . '/studio/monetization',
            ],
        );
    }
}
