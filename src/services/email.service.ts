import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '../config/env';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendAppFeedback(
  userEmail: string,
  userName: string,
  subject: string,
  message: string,
): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
      <h2 style="color: #1a1a2e; margin-bottom: 4px;">Медицинский AI Анализ</h2>
      <p style="color: #555; margin-top: 0; margin-bottom: 24px;">Новое сообщение от пользователя</p>
      <div style="background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 100px; vertical-align: top;">Пользователь:</td>
            <td style="padding: 8px 0; color: #1a1a2e; font-size: 14px;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; vertical-align: top;">Email:</td>
            <td style="padding: 8px 0; color: #1a1a2e; font-size: 14px;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 13px; vertical-align: top;">Тема:</td>
            <td style="padding: 8px 0; color: #1a1a2e; font-size: 14px;">${subject}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin-bottom: 20px;" />
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px;">Сообщение:</p>
        <p style="color: #1a1a2e; font-size: 14px; line-height: 1.7; white-space: pre-wrap; margin: 0;">${message}</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: SMTP_FROM,
    to: 'medicalaibot@yandex.ru',
    subject: `Обратная связь: ${subject}`,
    html,
    replyTo: userEmail,
  });
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
      <h2 style="color: #1a1a2e; text-align: center; margin-bottom: 8px;">
        Медицинский AI Анализ
      </h2>
      <p style="color: #555; text-align: center; margin-bottom: 24px;">
        Подтверждение электронной почты
      </p>
      <div style="background: #ffffff; border-radius: 8px; padding: 24px; text-align: center; border: 1px solid #e5e7eb;">
        <p style="color: #333; margin-bottom: 16px;">Ваш код подтверждения:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e; padding: 16px; background: #f0f4ff; border-radius: 8px; display: inline-block;">
          ${code}
        </div>
        <p style="color: #888; font-size: 14px; margin-top: 16px;">
          Код действителен в течение 15 минут
        </p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">
        Если вы не запрашивали этот код, просто проигнорируйте это письмо.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: 'Код подтверждения — Медицинский AI Анализ',
    html,
  });
}
