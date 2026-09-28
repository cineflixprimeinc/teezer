<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LoginOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $loginUrl;
    public int $expiryMinutes;

    public function __construct(
        public string $otp,
        public string $loginToken,
        public string $firstName,
    ) {
        $appUrl = rtrim(config('app.url', 'https://teezer.live'), '/');
        $this->loginUrl      = $appUrl . '/magic-login?token=' . urlencode($loginToken);
        $this->expiryMinutes = (int) \App\Models\AppSetting::get('otp_expiry_minutes', 10);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Teezer login code – ' . $this->otp);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.otp_verification');
    }
}
