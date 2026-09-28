<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AdminActionMail extends Mailable
{
    use Queueable, SerializesModels;

    public string  $referenceId;
    public string  $sentAt;

    public function __construct(
        public string  $firstName,
        public string  $username,
        public string  $actionType,
        public string  $actionLabel,
        public string  $description,
        public ?string $expiresAt    = null,
        public ?string $adminNote    = null,
        public ?string $appealUrl    = null,
    ) {
        $this->appealUrl   = $appealUrl ?? rtrim(config('app.url', 'https://teezer.live'), '/') . '/contact';
        $this->referenceId = 'RSL-' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
        $this->sentAt      = now()->format('M j, Y g:i A');
    }

    public function envelope(): Envelope
    {
        $subjects = [
            'warn'         => 'A warning has been issued on your account',
            'mute'         => 'Your conversation has been muted by Teezer',
            'close'        => 'A conversation has been closed by Teezer',
            'restrict'     => 'Restrictions have been applied to your account',
            'block'        => 'Your DM access has been restricted',
            'shadow'       => 'Your account visibility has been adjusted',
            'flag'         => 'Your conversation has been flagged for review',

            'verification_approved' => 'You are now verified on Teezer',
            'verification_rejected' => 'About your Teezer verification application',
            'verification_revoked'  => 'Your Teezer verification badge has been removed',

            'ad_approved' => 'Your Teezer ad has been approved',
            'ad_rejected' => 'About your Teezer ad submission',
            'ad_ended'    => 'Your Teezer ad campaign has ended',
            'ad_banned'   => 'Your Teezer ad was removed for a policy violation',
        ];

        return new Envelope(
            subject: $subjects[$this->actionType] ?? 'An action has been taken on your Teezer account'
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.admin_action');
    }
}
