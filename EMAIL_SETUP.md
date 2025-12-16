# Email Verification Setup Guide

Email verification is now fully implemented! Here's how to set it up:

## Quick Setup

### 1. Get a Resend API Key (Recommended)

1. Go to [Resend.com](https://resend.com) and sign up for a free account
2. Navigate to API Keys in your dashboard
3. Create a new API key
4. Copy the API key

### 2. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Email Service (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx

# Email sender address (must be verified in Resend)
# For development, you can use: onboarding@resend.dev
EMAIL_FROM=onboarding@resend.dev

# Your app URL (already set, but verify it's correct)
NEXTAUTH_URL=http://localhost:3000
```

### 3. Verify Your Domain (Production)

For production, you'll need to:
1. Add your domain in Resend dashboard
2. Add the DNS records Resend provides
3. Wait for verification
4. Update `EMAIL_FROM` to use your verified domain (e.g., `noreply@yourdomain.com`)

## Development Mode

If you don't set `RESEND_API_KEY`, the app will work in development mode:
- Emails will be logged to the console instead of being sent
- You can copy the verification link from the console logs
- This is perfect for local development and testing

## How It Works

1. **Registration**: When a user signs up, a verification token is generated and an email is sent
2. **Verification**: User clicks the link in the email, which verifies their email address
3. **Login**: By default, users can log in even without verifying (you can enable strict verification in `lib/auth.ts`)

## Enabling Strict Email Verification

To require email verification before login, uncomment these lines in `lib/auth.ts`:

```typescript
// In the authorize function, around line 40:
if (!user.emailVerified) {
  throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
}
```

## Testing

1. Register a new account
2. Check your email (or console logs in dev mode)
3. Click the verification link
4. You'll be redirected to a success page
5. Now you can log in

## Email Templates

The email templates are in `lib/email.ts`. You can customize:
- `sendVerificationEmail()` - Email verification template
- `sendPasswordResetEmail()` - Password reset template

Both templates are HTML emails with a modern design.

## Troubleshooting

### Emails not sending?
- Check that `RESEND_API_KEY` is set correctly
- Verify your domain in Resend (for production)
- Check the console for error messages

### Verification link not working?
- Make sure `NEXTAUTH_URL` matches your actual URL
- Check that the token hasn't expired (24 hours for verification, 1 hour for password reset)
- Verify the database connection is working

### Want to use a different email service?
You can modify `lib/email.ts` to use:
- SendGrid
- AWS SES
- Nodemailer (for SMTP)
- Any other email service

Just replace the `sendEmail()` function with your preferred service.

