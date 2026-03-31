import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
  // Cron runs at 00:00 UTC.
  // We calculate the target UTC hour for each user and use ntfy.sh's Delay header.
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let scheduledCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const settings = userData.notificationSettings;
      const ntfyTopic = userData.ntfyTopic;
      
      if (settings?.dailyReminder?.enabled && ntfyTopic) {
        const [hours, minutes] = (settings.dailyReminder.time || '20:00').split(':').map(Number);
        
        // Convert local hour (Turkey UTC+3) to UTC
        const targetUTCHour = (hours - 3 + 24) % 24;
        const targetUTCMinutes = minutes;
        
        // Calculate delay from 00:00 UTC today
        // Total minutes from 00:00 UTC to target time
        const totalMinutesDelay = (targetUTCHour * 60) + targetUTCMinutes;
        
        // If the target time has already passed today (unlikely if cron runs at 00:00),
        // we could skip or schedule for tomorrow, but 00:00 is safe.
        if (totalMinutesDelay >= 0) {
          await fetch(`https://ntfy.sh/${ntfyTopic}`, {
            method: 'POST',
            headers: {
              'Title': 'HatimPro Günlük Hatırlatıcı',
              'Tags': 'mosque,clock8',
              'Click': process.env.APP_URL || 'https://hatimpro.vercel.app',
              'Delay': `${totalMinutesDelay}m`
            },
            body: settings.dailyReminder.message || "Günlük Kuran okumanızı yapmayı unutmayın."
          });
          scheduledCount++;
        }
      }
    }
    
    return res.status(200).json({ success: true, scheduledCount });
  } catch (error: any) {
    console.error("Cron Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
