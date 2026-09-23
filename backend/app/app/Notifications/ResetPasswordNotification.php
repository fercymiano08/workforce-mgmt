<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

class ResetPasswordNotification extends ResetPassword
{
    /**
     * Build the mail representation, linking to the frontend SPA's
     * /reset-password page (with MAIL_MAILER=log, this writes to
     * storage/logs/laravel.log instead of a real inbox).
     */
    public function toMail($notifiable): MailMessage
    {
        $frontendUrl = rtrim(config('app.frontend_url'), '/');
        $url = sprintf(
            '%s/reset-password?token=%s&email=%s',
            $frontendUrl,
            $this->token,
            urlencode($notifiable->getEmailForPasswordReset())
        );

        return (new MailMessage)
            ->subject('Reset Your WorkForce Pro Password')
            ->line('You are receiving this email because we received a password reset request for your account.')
            ->action('Reset Password', $url)
            ->line('This password reset link will expire in 60 minutes.')
            ->line('If you did not request a password reset, no further action is required.');
    }
}
