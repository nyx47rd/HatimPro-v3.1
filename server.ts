import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import crypto from "crypto";
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, addDoc } from 'firebase/firestore';

dotenv.config();

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(bodyParser.json());

  // Chat Request Endpoint
  app.post("/api/chat/request", async (req, res) => {
    const { messages, encryptionKey, chatId } = req.body;
    if (!messages || !encryptionKey || !chatId) {
      return res.status(400).json({ error: 'Eksik parametreler' });
    }

    try {
      await setDoc(doc(db, 'pending_chats', chatId), {
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Firestore write error:", error);
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.status(202).json({ status: 'pending', chatId });

    // Process asynchronously
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

      await setDoc(doc(db, 'pending_chats', chatId), {
        status: 'completed',
        encryptedData: encryptedBase64,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Async chat error:", error);
      await setDoc(doc(db, 'pending_chats', chatId), {
        status: 'error',
        error: error.message,
        updatedAt: new Date().toISOString()
      });
    }
  });

  // Chat Status Endpoint
  app.get("/api/chat/status", async (req, res) => {
    const chatId = req.query.chatId as string;
    if (!chatId) {
      return res.status(400).json({ error: 'Eksik parametreler' });
    }

    try {
      const docRef = doc(db, 'pending_chats', chatId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return res.status(200).json(docSnap.data());
      } else {
        return res.status(404).json({ error: 'Sohbet bulunamadı' });
      }
    } catch (error: any) {
      console.error("Firestore read error:", error);
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }
  });

  // Check Update Endpoint
  app.get("/api/check-update", async (req, res) => {
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (!token || !projectId) {
      return res.status(500).json({ error: 'Vercel Token veya Project ID yapılandırılmamış.' });
    }

    try {
      const response = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1&state=READY`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Vercel API isteği başarısız oldu');
      }

      const data = await response.json();
      
      if (data.deployments && data.deployments.length > 0) {
        const latest = data.deployments[0];
        return res.status(200).json({ 
          sha: latest.meta?.githubCommitSha || latest.uid,
          createdAt: latest.createdAt
        });
      }

      return res.status(404).json({ error: 'Hiçbir deployment bulunamadı.' });
    } catch (error) {
      console.error("Vercel Update Check Error:", error);
      return res.status(500).json({ error: 'Deployment verileri alınırken bir hata oluştu.' });
    }
  });

  // Subscribe Route (Kept for backward compatibility)
  app.post("/api/notifications/subscribe", (req, res) => {
    res.status(201).json({ message: "ntfy.sh is used for notifications" });
  });

  // Send Notification Route (using ntfy.sh)
  app.post("/api/notifications/send", async (req, res) => {
    let parsedBody = req.body;
    if (typeof req.body === 'string') {
      try { parsedBody = JSON.parse(req.body); } catch (e) {}
    }

    const title = parsedBody?.title || 'HatimPro Bildirimi';
    const bodyText = parsedBody?.body || 'Yeni bildirim!';
    const ntfyTopic = parsedBody?.ntfyTopic;
    const url = parsedBody?.url;

    if (!ntfyTopic) {
      return res.status(400).json({ error: "ntfyTopic eksik." });
    }

    try {
      const headers: Record<string, string> = {
        'Title': title,
        'Tags': 'mosque,bell'
      };
      
      if (url) {
        headers['Click'] = url.startsWith('http') ? url : `${process.env.APP_URL || ''}${url}`;
      }

      const response = await fetch(`https://ntfy.sh/${ntfyTopic}`, {
        method: 'POST',
        headers,
        body: bodyText
      });

      if (!response.ok) {
        throw new Error(`ntfy error: ${response.statusText}`);
      }

      res.status(200).json({ message: "Bildirim ntfy üzerinden gönderildi" });
    } catch (err: any) {
      console.error("Error sending ntfy notification:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
