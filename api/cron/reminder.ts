import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { Resend } from 'resend';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID
};

const appFirebase = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(appFirebase);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check for Vercel Cron Secret (optional but recommended)
  // if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).end('Unauthorized');
  // }

  const now = new Date();
  // This cron will run every hour (configured in vercel.json)
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let sentCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const settings = userData.notificationSettings;
      
      if (settings?.dailyReminder?.enabled && userData.email) {
        const [hours, minutes] = (settings.dailyReminder.time || '20:00').split(':').map(Number);
        
        // Check if it's the right hour
        if (now.getHours() === hours) {
          if (resend) {
            await resend.emails.send({
              from: 'HatimPro <onboarding@resend.dev>',
              to: userData.email,
              subject: "HatimPro Günlük Hatırlatıcı",
              text: settings.dailyReminder.message || "Günlük Kuran okumanızı yapmayı unutmayın.",
              html: `<p>${settings.dailyReminder.message || "Günlük Kuran okumanızı yapmayı unutmayın."}</p>`
            });
            sentCount++;
          }
        }
      }
    }
    
    return res.status(200).json({ success: true, sentCount });
  } catch (error: any) {
    console.error("Cron Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
