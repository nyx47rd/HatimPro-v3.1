import type { VercelRequest, VercelResponse } from '@vercel/node';

const ONESIGNAL_APP_ID = process.env.VITE_ONESIGNAL_APP_ID || '61205574-f992-486d-ae82-7b6632beb067';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let parsedBody = req.body;
  if (typeof req.body === 'string') {
    try { parsedBody = JSON.parse(req.body); } catch (e) {}
  }

  const title = parsedBody?.title || 'HatimPro';
  const bodyText = parsedBody?.body || 'Yeni bildirim!';
  const url = parsedBody?.url || '/';
  const subscription = parsedBody?.subscription;
  
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return res.status(500).json({ error: "OneSignal REST_API_KEY eksik. Lütfen Vercel Environment Variables kısmına ekleyin." });
  }

  try {
    const payload: any = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title, tr: title },
      contents: { en: bodyText, tr: bodyText },
      subtitle: { en: bodyText, tr: bodyText },
      url: url,
      target_channel: "push"
    };

    if (subscription) {
      // Check if it's a OneSignal UUID or a Firebase UID (external_id)
      if (subscription.includes('-')) {
        payload.include_subscription_ids = [subscription];
      } else {
        payload.include_aliases = {
          external_id: [subscription]
        };
      }
    } else {
      // Send to all
      payload.included_segments = ["Total Subscriptions"];
    }

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("OneSignal Send Response:", data);
    
    if (response.ok) {
      if (data.recipients === 0) {
        return res.status(200).json({ success: true, warning: "Bildirim gönderildi ancak alıcı bulunamadı (recipients: 0). Abonelik ID'si geçersiz olabilir.", data });
      }
      return res.status(200).json({ success: true, data });
    } else {
      console.error("OneSignal API Error:", data);
      
      // Handle invalid_player_ids gracefully
      if (data.errors && data.errors.invalid_player_ids) {
        return res.status(200).json({ 
          success: false, 
          warning: "Bildirim izniniz geçersiz veya süresi dolmuş. Lütfen tarayıcı ayarlarından bildirim iznini sıfırlayıp tekrar izin verin.", 
          data 
        });
      }

      return res.status(response.status).json({ 
        error: 'Failed to send notification',
        details: data.errors ? data.errors[0] : "OneSignal API Hatası" 
      });
    }
  } catch (error: any) {
    console.error('Push error:', error);
    return res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message 
    });
  }
}
