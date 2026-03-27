const KEY_STORAGE_NAME = 'hatim_e2ee_key';

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getOrGenerateKey(): Promise<CryptoKey> {
  const storedKey = localStorage.getItem(KEY_STORAGE_NAME);
  if (storedKey) {
    const keyData = Uint8Array.from(atob(storedKey), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
  }

  const newKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const exported = await crypto.subtle.exportKey('raw', newKey);
  const base64Key = arrayBufferToBase64(exported);
  localStorage.setItem(KEY_STORAGE_NAME, base64Key);
  
  return newKey;
}

export function getRawKeyBase64(): string | null {
  return localStorage.getItem(KEY_STORAGE_NAME);
}

export async function encryptData(text: string): Promise<string> {
  try {
    const key = await getOrGenerateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);
    
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );
    
    const encryptedArray = new Uint8Array(encryptedContent);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv, 0);
    combined.set(encryptedArray, iv.length);
    
    return arrayBufferToBase64(combined);
  } catch (e) {
    console.error("Encryption failed", e);
    return "";
  }
}

export async function decryptData(encryptedBase64: string): Promise<string> {
  if (!encryptedBase64) return "";
  try {
    const key = await getOrGenerateKey();
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const encryptedContent = combined.slice(12);
    
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedContent
    );
    
    return new TextDecoder().decode(decryptedContent);
  } catch (e) {
    console.error("Decryption failed", e);
    return "";
  }
}
