import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export interface EmailOptions {
  to: string;
  subject: string;
  bodyText: string;
  resumeBuffer?: Buffer;
  resumeFilename?: string;
}

/**
 * Sends a personalized application email directly to a recruiter.
 * Attaches the tailored resume version if provided.
 */
export async function sendRecruiterEmail(options: EmailOptions): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.error("❌ SMTP credentials missing in environment variables. Email cannot be sent.");
    return false;
  }

  try {
    console.log(`✉️ Setting up SMTP transport via ${smtpHost}:${smtpPort}...`);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465, // true for port 465, false for other ports (587, etc.)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const mailOptions: any = {
      from: `"${process.env.SMTP_FROM_NAME || 'Harish Narpula'}" <${smtpUser}>`,
      to: options.to,
      subject: options.subject,
      text: options.bodyText,
    };

    // Attach resume PDF if present
    if (options.resumeBuffer && options.resumeFilename) {
      mailOptions.attachments = [
        {
          filename: options.resumeFilename,
          content: options.resumeBuffer,
          contentType: "application/pdf",
        },
      ];
      console.log(`📄 Attaching resume: ${options.resumeFilename} (${options.resumeBuffer.length} bytes)`);
    }

    console.log(`📤 Sending email to: ${options.to}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully! MessageID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("❌ Error sending application email:", error);
    return false;
  }
}
