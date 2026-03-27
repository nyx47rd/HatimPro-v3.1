import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, encryptionKey, chatId } = req.body;
  if (!messages || !encryptionKey || !chatId) {
    return res.status(400).json({ error: 'Eksik parametreler' });
  }

  // Set status to pending in Firestore immediately
  try {
    await setDoc(doc(db, 'pending_chats', chatId), {
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Firestore write error:", error);
    return res.status(500).json({ error: 'Veritabanı hatası' });
  }

  // Process AI request in the background using waitUntil
  waitUntil(
    (async () => {
      try {
        const apiKey = process.env.VITE_POLLINATIONS_API_KEY;
        if (!apiKey) throw new Error('API anahtarı bulunamadı');

        const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gemini-fast',
            messages: messages
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API Hatası (${response.status}): ${errText.slice(0, 100)}...`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;

        // Encrypt the response using the provided key
        const keyBuffer = Buffer.from(encryptionKey, 'base64');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
        
        let encrypted = cipher.update(assistantMessage, 'utf8');
        const finalBuffer = cipher.final();
        const authTag = cipher.getAuthTag();
        
        const combined = Buffer.concat([iv, encrypted, finalBuffer, authTag]);
        const encryptedBase64 = combined.toString('base64');

        // Write completed status and encrypted data to Firestore
        await setDoc(doc(db, 'pending_chats', chatId), {
          status: 'completed',
          encryptedData: encryptedBase64,
          updatedAt: new Date().toISOString()
        });
      } catch (error: any) {
        console.error("Async chat error:", error);
        
        // Write error status to Firestore
        await setDoc(doc(db, 'pending_chats', chatId), {
          status: 'error',
          error: error.message,
          updatedAt: new Date().toISOString()
        });
      }
    })()
  );

  // Return 202 Accepted immediately so the client can start polling
  return res.status(202).json({ status: 'pending', chatId });
}
