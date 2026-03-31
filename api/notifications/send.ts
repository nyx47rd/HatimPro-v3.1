import type { VercelRequest, VercelResponse } from '@vercel/node';

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
  const ntfyTopic = parsedBody?.ntfyTopic;
  const url = parsedBody?.url;
  const delay = parsedBody?.delay; // Delay in minutes or string like "10m"

  if (!ntfyTopic) {
    return res.status(400).json({ error: "ntfyTopic eksik." });
  }

  try {
    const headers: Record<string, string> = {
      'Title': title,
      'Click': url ? `${process.env.APP_URL || 'https://hatimpro.vercel.app'}${url}` : '',
      'Tags': 'mosque,star'
    };

    if (delay) {
      headers['Delay'] = typeof delay === 'number' ? `${delay}m` : delay;
    }

    const response = await fetch(`https://ntfy.sh/${ntfyTopic}`, {
      method: 'POST',
      headers,
      body: bodyText
    });

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      const errText = await response.text();
      console.error("ntfy.sh API Error:", errText);
      return res.status(response.status).json({ 
        error: 'Failed to send notification',
        details: errText 
      });
    }
  } catch (error: any) {
    console.error('ntfy error:', error);
    return res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message 
    });
  }
}
