<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SignupOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $verifyUrl;
    public int $expiryMinutes;

    public function __construct(
        public string $otp,
        public string $linkToken,
        public string $firstName,
    ) {
        $frontendUrl = rtrim(config('app.frontend_url', 'https://teezer.live'), '/');
        $this->verifyUrl     = $frontendUrl . '/verify-email?token=' . urlencode($linkToken);
        $this->expiryMinutes = (int) \App\Models\AppSetting::get('otp_expiry_minutes', 30);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Verify your Teezer account – ' . $this->otp);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.signup_otp');
    }
}
