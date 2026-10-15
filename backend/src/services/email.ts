import nodemailer from 'nodemailer';

// Email configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@example.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Create transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) {
    return transporter;
  }

  // If SMTP is not configured, return null (emails will be logged instead)
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  Email service not configured. Set SMTP_USER and SMTP_PASSWORD in .env to enable emails.');
    console.warn('💡 Tip: For Gmail, you can use SendGrid, Mailgun, or other services instead.');
    return null;
  }

  // Support for Gmail with "Less Secure App Access" or OAuth2
  // Note: Gmail's "Less Secure App Access" is deprecated, but may still work for some accounts
  const transportConfig: any = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  };

  // For Gmail, add additional options
  if (SMTP_HOST.includes('gmail.com')) {
    transportConfig.service = 'gmail';
    // Gmail may require these settings
    transportConfig.tls = {
      rejectUnauthorized: false,
    };
  }

  transporter = nodemailer.createTransport(transportConfig);

  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    // In development, log the email instead of sending
    console.log('\n📧 Email (not sent - SMTP not configured):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // Extract reset link from HTML if it's a password reset email
    const resetLinkMatch = options.html.match(/href="([^"]+)"/);
    if (resetLinkMatch) {
      console.log('Reset Link:', resetLinkMatch[1]);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return false;
  }

  try {
    await emailTransporter.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });

    console.log(`✅ Email sent to ${options.to}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error sending email:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.response) {
      console.error('SMTP response:', error.response);
    }
    return false;
  }
}

// Email templates
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a855f7, #ec4899); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>We received a request to reset your password. Click the button below to reset it:</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset Your Password',
    html,
  });
}

export async function sendWelcomeEmail(email: string, username?: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a855f7, #ec4899); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to BuddyChatAI!</h1>
        </div>
        <div class="content">
          <p>Hello${username ? ` ${username}` : ''},</p>
          <p>Welcome to BuddyChatAI! We're excited to have you join us.</p>
          <p>Get started by exploring our features and connecting with others.</p>
          <p style="text-align: center;">
            <a href="${FRONTEND_URL}" class="button">Get Started</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to BuddyChatAI!',
    html,
  });
}

export async function sendPaymentConfirmationEmail(email: string, amount: number, tokens: number): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .info-box { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Confirmed</h1>
        </div>
        <div class="content">
          <p>Thank you for your purchase!</p>
          <div class="info-box">
            <div class="info-row">
              <strong>Amount Paid:</strong>
              <span>$${(amount / 100).toFixed(2)}</span>
            </div>
            <div class="info-row">
              <strong>Tokens Added:</strong>
              <span>${tokens.toLocaleString()}</span>
            </div>
          </div>
          <p>Your tokens have been added to your account and are ready to use.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Payment Confirmed',
    html,
  });
}

export async function sendNewFollowerEmail(email: string, followerUsername: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a855f7, #ec4899); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Follower</h1>
        </div>
        <div class="content">
          <p><strong>${followerUsername}</strong> started following you!</p>
          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/profile/${followerUsername}" class="button">View Profile</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `${followerUsername} started following you`,
    html,
  });
}

export async function sendNewMessageEmail(email: string, senderUsername: string, messagePreview: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .message-preview { background: white; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 3px solid #a855f7; }
        .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a855f7, #ec4899); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Message</h1>
        </div>
        <div class="content">
          <p><strong>${senderUsername}</strong> sent you a message:</p>
          <div class="message-preview">
            <p>${messagePreview}</p>
          </div>
          <p style="text-align: center;">
            <a href="${FRONTEND_URL}/messages" class="button">View Message</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `New message from ${senderUsername}`,
    html,
  });
}
