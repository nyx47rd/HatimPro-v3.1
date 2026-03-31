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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const now = new Date();
  // Vercel Cron runs in UTC. Turkey is UTC+3.
  // To check for 20:00 Turkey time, we check for 17:00 UTC.
  const currentUTCHour = now.getUTCHours();
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let sentCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const settings = userData.notificationSettings;
      const ntfyTopic = userData.ntfyTopic;
      
      if (settings?.dailyReminder?.enabled && ntfyTopic) {
        const [hours, minutes] = (settings.dailyReminder.time || '20:00').split(':').map(Number);
        
        // Convert local hour to UTC (assuming Turkey UTC+3 for now)
        // This is a simple approximation.
        const targetUTCHour = (hours - 3 + 24) % 24;
        
        if (currentUTCHour === targetUTCHour) {
          await fetch(`https://ntfy.sh/${ntfyTopic}`, {
            method: 'POST',
            headers: {
              'Title': 'HatimPro Günlük Hatırlatıcı',
              'Tags': 'mosque,clock8',
              'Click': process.env.APP_URL || 'https://hatimpro.vercel.app'
            },
            body: settings.dailyReminder.message || "Günlük Kuran okumanızı yapmayı unutmayın."
          });
          sentCount++;
        }
      }
    }
    
    return res.status(200).json({ success: true, sentCount, currentUTCHour });
  } catch (error: any) {
    console.error("Cron Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
