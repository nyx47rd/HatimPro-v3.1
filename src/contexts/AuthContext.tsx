import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';

import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle Magic Link Sign In
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        // User opened the link on a different device. To prevent session fixation
        // attacks, ask the user to provide the associated email again.
        email = window.prompt('Lütfen doğrulama için e-posta adresinizi girin:');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            // Remove the link from URL to prevent re-triggering
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch((error) => {
            console.error("Magic link sign in error:", error);
          });
      }
    }

    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Listen to profile changes
        const profileRef = doc(db, 'users', user.uid);
        
        // Ensure profile exists
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          const baseName = user.displayName 
            ? user.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') 
            : (user.email ? user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') : 'user');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const generatedUsername = `${baseName}${randomSuffix}`.substring(0, 20);

          const newProfile: UserProfile = {
            uid: user.uid,
            username: generatedUsername,
            displayName: user.displayName || 'İsimsiz Kullanıcı',
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            following: [],
            followers: [],
            stats: { 
              totalHatim: 0, 
              totalZikir: 0, 
              totalReadPages: 0,
              streak: 0,
              xp: 0
            }
          };
          await setDoc(profileRef, newProfile);
        }

        if (unsubProfile) unsubProfile();
        unsubProfile = onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            setProfile({ ...doc.data(), uid: doc.id } as UserProfile);
          }
        }, (error) => {
          console.error("Profile snapshot error:", error);
        });
        
        setLoading(false);
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = undefined;
        }
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
