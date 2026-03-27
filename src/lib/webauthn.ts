import { auth, db } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { updatePassword, signInWithEmailAndPassword } from 'firebase/auth';

// Helper to convert ArrayBuffer to Base64URL (safe for Firestore document IDs)
export const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// Helper to convert Base64URL to ArrayBuffer
export const base64ToBuffer = (base64: string): ArrayBuffer => {
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (standardBase64.length % 4) {
    standardBase64 += '=';
  }
  const binary = window.atob(standardBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// AES-GCM Encryption Helpers
const generateEncryptionKey = async () => {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

const exportKey = async (key: CryptoKey) => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return new Uint8Array(exported);
};

const importKey = async (rawKey: ArrayBuffer) => {
  return await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
};

const encryptData = async (key: CryptoKey, data: string) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return { iv: bufferToBase64(iv.buffer), ciphertext: bufferToBase64(ciphertext) };
};

const decryptData = async (key: CryptoKey, ivBase64: string, ciphertextBase64: string) => {
  const iv = base64ToBuffer(ivBase64);
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
};

const generateRandomPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Registers a new passkey for the currently logged-in user.
 */
export const registerPasskey = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı girişi yapılmamış.');
  if (!user.email) throw new Error('Passkey eklemek için hesabınıza bir e-posta adresi bağlı olmalıdır.');

  if (!window.PublicKeyCredential) {
    throw new Error('Tarayıcınız WebAuthn (Passkey) desteklemiyor.');
  }

  try {
    // 1. Generate a strong random password and update Firebase Auth
    // This allows us to log the user in later without a backend
    const newPassword = generateRandomPassword();
    try {
      await updatePassword(user, newPassword);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        throw new Error('Güvenlik nedeniyle Passkey eklemeden önce çıkış yapıp tekrar giriş yapmanız gerekmektedir.');
      }
      throw err;
    }

    // 2. Generate an encryption key to secure the credentials
    const encryptionKey = await generateEncryptionKey();
    const rawKey = await exportKey(encryptionKey); // 32 bytes, fits in userHandle

    // 3. Encrypt the login credentials
    const payload = JSON.stringify({ email: user.email, password: newPassword });
    const { iv, ciphertext } = await encryptData(encryptionKey, payload);

    // 4. Create the Passkey, storing the raw encryption key in the user.id (userHandle)
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Hatim Pro',
          id: window.location.hostname,
        },
        user: {
          id: rawKey, // Store the decryption key here!
          name: user.email,
          displayName: user.displayName || user.email,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential;

    if (!credential) throw new Error('Passkey oluşturulamadı.');

    const credentialIdStr = bufferToBase64(credential.rawId);
    
    // 5. Store the encrypted credentials in a public Firestore collection
    // The data is safe because the decryption key is only on the user's authenticator
    await setDoc(doc(db, 'passkey_payloads', credentialIdStr), {
      iv,
      ciphertext,
      createdAt: new Date().toISOString()
    });

    // Also store a reference in the user's private collection for management
    await setDoc(doc(db, 'users', user.uid, 'passkeys', credentialIdStr), {
      credentialId: credentialIdStr,
      createdAt: new Date().toISOString(),
      status: 'active'
    });

    return credential;
  } catch (error: any) {
    console.error('Passkey registration error:', error);
    throw new Error(error.message || 'Biyometrik kayıt sırasında bir hata oluştu.');
  }
};

/**
 * Authenticates a user using a previously registered passkey.
 */
export const loginWithPasskey = async () => {
  if (!window.PublicKeyCredential) {
    throw new Error('Tarayıcınız WebAuthn (Passkey) desteklemiyor.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  try {
    // 1. Request the passkey from the authenticator
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!assertion) throw new Error('Passkey doğrulaması başarısız.');

    const authAssertion = assertion as AuthenticatorAssertionResponse & PublicKeyCredential;
    const response = authAssertion.response as AuthenticatorAssertionResponse;
    
    if (!response.userHandle) {
      throw new Error('Passkey verisi eksik (userHandle bulunamadı). Lütfen passkey\'i yeniden ekleyin.');
    }

    const credentialIdStr = bufferToBase64(assertion.rawId);

    // 2. Fetch the encrypted payload from Firestore
    const payloadDoc = await getDoc(doc(db, 'passkey_payloads', credentialIdStr));
    if (!payloadDoc.exists()) {
      throw new Error('Passkey verisi sunucuda bulunamadı. Lütfen passkey\'i yeniden ekleyin.');
    }

    const { iv, ciphertext } = payloadDoc.data();

    // 3. Decrypt the payload using the key from the authenticator (userHandle)
    const encryptionKey = await importKey(response.userHandle);
    const decryptedJson = await decryptData(encryptionKey, iv, ciphertext);
    const { email, password } = JSON.parse(decryptedJson);

    // 4. Log in to Firebase Auth
    await signInWithEmailAndPassword(auth, email, password);

    return {
      success: true,
      message: 'Biyometrik giriş başarılı!'
    };
  } catch (error: any) {
    console.error('Passkey login error:', error);
    throw new Error(error.message || 'Biyometrik giriş sırasında bir hata oluştu.');
  }
};

/**
 * Fetches the user's registered passkeys.
 */
export const getUserPasskeys = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı girişi yapılmamış.');

  try {
    const passkeysRef = collection(db, 'users', user.uid, 'passkeys');
    const snapshot = await getDocs(passkeysRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error: any) {
    console.error('Error fetching passkeys:', error);
    throw new Error('Passkey listesi alınırken bir hata oluştu.');
  }
};

/**
 * Deletes a registered passkey.
 */
export const deletePasskey = async (credentialId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı girişi yapılmamış.');

  try {
    // Delete from user's private collection
    await deleteDoc(doc(db, 'users', user.uid, 'passkeys', credentialId));
    // Delete from public payloads collection
    await deleteDoc(doc(db, 'passkey_payloads', credentialId));
  } catch (error: any) {
    console.error('Error deleting passkey:', error);
    throw new Error('Passkey silinirken bir hata oluştu.');
  }
};
