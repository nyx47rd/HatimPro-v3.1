import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let parsedBody = req.body;
  if (typeof req.body === 'string') {
    try { parsedBody = JSON.parse(req.body); } catch (e) {}
  }

  const title = parsedBody?.title || 'HatimPro Bildirimi';
  const bodyText = parsedBody?.body || 'Yeni bildirim!';
  const toEmail = parsedBody?.email;

  if (!toEmail) {
    return res.status(400).json({ error: "E-posta adresi eksik." });
  }

  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SIMULATION] To: ${toEmail}, Subject: ${title}, Body: ${bodyText}`);
    return res.status(200).json({ message: "E-posta simüle edildi (RESEND_API_KEY eksik)", simulated: true });
  }

  const resend = new Resend(RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: 'HatimPro <onboarding@resend.dev>',
      to: toEmail,
      subject: title,
      text: bodyText,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #f4f7f4; border-radius: 10px;">
          <h2 style="color: #324232;">${title}</h2>
          <p style="color: #4a664a; font-size: 16px;">${bodyText}</p>
          <hr style="border-color: #ceddce; margin-top: 20px; margin-bottom: 20px;" />
          <p style="color: #82a382; font-size: 12px;">Bu e-posta HatimPro tarafından gönderilmiştir.</p>
        </div>
      `
    });

    if (error) {
      console.error("Resend API Error:", error);
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message 
      });
    }

    return res.status(200).json({ success: true, id: data?.id });
  } catch (error: any) {
    console.error('Email error:', error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
}
