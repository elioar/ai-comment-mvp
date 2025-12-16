import { Resend } from 'resend';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail({ to, subject, html }: EmailOptions) {
  // If no API key is set, log the email in development
  if (!resend || !process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Email would be sent:');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('HTML:', html);
    }
    return { success: true, id: 'dev-mode' };
  }

  try {
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(email: string, token: string, name?: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'https://my-comments-rosy.vercel.app';
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                
                <!-- Header with logo/icon -->
                <tr>
                  <td style="padding: 48px 40px 32px; text-align: center;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px; margin: 0 auto 24px; display: inline-flex; align-items: center; justify-content: center;">
                      <span style="font-size: 32px; color: white;">✉️</span>
                    </div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                      Verify Your Email
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
                      ${name ? `Hi <strong>${name}</strong>,` : 'Hi there,'}
                    </p>
                    <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #475569;">
                      Welcome to My Comments! Click the button below to verify your email and start automating your Facebook comments.
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 0 0 32px;">
                          <a href="${verificationUrl}" 
                             style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.3);">
                            Verify Email →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="border-top: 1px solid #e2e8f0; margin: 32px 0;"></div>

                    <!-- Alternative link -->
                    <p style="margin: 0 0 12px; font-size: 13px; color: #64748b;">
                      Or copy and paste this link:
                    </p>
                    <p style="margin: 0 0 24px; font-size: 12px; color: #94a3b8; word-break: break-all; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                      ${verificationUrl}
                    </p>

                    <!-- Info text -->
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                      This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 32px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; text-align: center; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} My Comments. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your email address',
    html,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string, name?: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'https://my-comments-rosy.vercel.app';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                
                <!-- Header with logo/icon -->
                <tr>
                  <td style="padding: 48px 40px 32px; text-align: center;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px; margin: 0 auto 24px; display: inline-flex; align-items: center; justify-content: center;">
                      <span style="font-size: 32px; color: white;">🔐</span>
                    </div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                      Reset Your Password
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 0 40px 40px;">
                    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
                      ${name ? `Hi <strong>${name}</strong>,` : 'Hi there,'}
                    </p>
                    <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #475569;">
                      We received a request to reset your password. Click the button below to create a new password for your account.
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 0 0 32px;">
                          <a href="${resetUrl}" 
                             style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.3);">
                            Reset Password →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="border-top: 1px solid #e2e8f0; margin: 32px 0;"></div>

                    <!-- Alternative link -->
                    <p style="margin: 0 0 12px; font-size: 13px; color: #64748b;">
                      Or copy and paste this link:
                    </p>
                    <p style="margin: 0 0 24px; font-size: 12px; color: #94a3b8; word-break: break-all; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                      ${resetUrl}
                    </p>

                    <!-- Info text -->
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                      This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 32px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; text-align: center; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} My Comments. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your password',
    html,
  });
}

