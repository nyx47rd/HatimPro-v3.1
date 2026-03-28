import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'hatimpro_latest_deployment_sha';

export function useVercelUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestCommit, setLatestCommit] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle');
  
  const lastApiCallTime = useRef<number>(0);

  const checkForUpdates = useCallback(async (manual = false) => {
    const now = Date.now();
    // Throttle automatic checks to once every 30 seconds to avoid API rate limits
    if (!manual && now - lastApiCallTime.current < 30000) {
      return false;
    }
    
    lastApiCallTime.current = now;
    setIsChecking(true);
    setCheckStatus('checking');
    
    try {
      // Vercel API endpoint'imize istek atıyoruz
      const response = await fetch(`/api/check-update?t=${now}`);

      if (!response.ok) {
        throw new Error('Failed to fetch latest deployment');
      }

      const data = await response.json();
      const latestSha = data.sha;
      const currentSha = localStorage.getItem(STORAGE_KEY);

      setLatestCommit(latestSha);
      setLastCheckTime(new Date());

      if (currentSha && currentSha !== latestSha) {
        setUpdateAvailable(true);
        setCheckStatus('available');
        return true;
      } else if (!currentSha) {
        // First time running, just save the current commit
        localStorage.setItem(STORAGE_KEY, latestSha);
        setCheckStatus('up-to-date');
      } else {
        setCheckStatus('up-to-date');
      }
      
      // Reset status after a few seconds if it was manual and up-to-date
      if (manual) {
        setTimeout(() => {
          setCheckStatus(prev => prev === 'up-to-date' ? 'idle' : prev);
        }, 3000);
      }

      return false;
    } catch (error) {
      console.error("Error checking for updates:", error);
      setCheckStatus('error');
      if (manual) {
        setTimeout(() => setCheckStatus('idle'), 3000);
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdate = async () => {
    if (latestCommit) {
      localStorage.setItem(STORAGE_KEY, latestCommit);
    }
    
    // Clear all browser caches to ensure the new version is loaded
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (e) {
        console.error("Error clearing caches", e);
      }
    }
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error("Error unregistering service workers", e);
      }
    }
    
    // Hard reload with cache busting query param to home page to avoid 404s
    window.location.href = window.location.origin + '/?t=' + new Date().getTime();
  };

  useEffect(() => {
    // Initial check
    checkForUpdates();

    // Check when the user focuses the window/tab
    const handleFocus = () => checkForUpdates();
    // Check when the user interacts with the app (clicks anywhere)
    const handleClick = () => checkForUpdates();

    window.addEventListener('focus', handleFocus);
    document.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('click', handleClick);
    };
  }, [checkForUpdates]);

  return {
    updateAvailable,
    isChecking,
    lastCheckTime,
    checkStatus,
    checkForUpdates,
    applyUpdate
  };
}
