import React, { useState, useEffect, useMemo, FormEvent, useRef, Suspense, Component, ReactNode } from 'react';
import OneSignal from 'react-onesignal';
import { useLocation, useNavigate } from 'react-router-dom';
import { LiquidGlassButton } from './components/LiquidGlassButton';
import { 
  BookOpen,
  Plus, 
  History as HistoryIcon, 
  ChevronRight, 
  Trash2, 
  Calendar,
  X,
  CheckCircle2,
  TrendingUp,
  LayoutGrid,
  Info,
  Home,
  ListTodo,
  Clock,
  ArrowRight,
  RotateCcw,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  Star,
  CheckSquare,
  Square,
  Key,
  Lock,
  Mail,
  Link,
  Moon,
  Sun,
  User,
  MoreHorizontal,
  Settings,
  ChevronLeft,
  Bell,
  HelpCircle,
  Shield,
  Book,
  Trophy,
  BarChart2,
  Timer,
  Mic,
  Fingerprint,
  LogOut,
  UserPlus,
  Bot
} from 'lucide-react';
import { Drawer } from 'vaul';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { HatimData, ReadingLog, HatimTask } from './types';
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import { useGitHubUpdate } from './hooks/useGitHubUpdate';
import { syncDataToFirebase, listenToFirebaseData } from './services/db';
import { registerPasskey, getUserPasskeys, deletePasskey } from './lib/webauthn';
import { auth, db, storage } from './lib/firebase';
import { signOut, deleteUser, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, linkWithPopup, GithubAuthProvider, OAuthProvider, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { doc, deleteDoc, updateDoc, query, where, collection, onSnapshot, getDoc, deleteField, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';
import { getFirebaseErrorMessage } from './lib/firebaseErrors';
import * as OTPAuth from 'otpauth';

const STORAGE_KEY = 'hatim_tracker_data_v3';
const QURAN_TOTAL_PAGES = 604;

const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 
  202, 222, 242, 262, 282, 302, 322, 342, 362, 382, 
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582, 605
];

const AI_LIMITS = {
  minute: 5,
  hour: 20,
  day: 100
};

const SOUNDS = {
  click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  success: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  delete: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  open: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
};

const recalculateTaskLogs = (logs: ReadingLog[], task: HatimTask) => {
  const taskLogs = logs.filter(l => l.taskId === task.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  let basePage = task.startPage - 1;
  const recalculatedTaskLogs = taskLogs.map(log => {
    const absolutePage = Math.min(task.endPage, basePage + log.pagesRead);
    const actualPagesRead = absolutePage - basePage;
    basePage = absolutePage;
    return {
      ...log,
      absolutePage: absolutePage,
      pagesRead: actualPagesRead
    };
  }).filter(log => log.pagesRead > 0);

  const otherLogs = logs.filter(l => l.taskId !== task.id);
  
  return {
    logs: [...recalculatedTaskLogs, ...otherLogs],
    latestAbsolutePage: basePage
  };
};

const LazyZikirPage = React.lazy(() => import('./components/ZikirPage').then(module => ({ default: module.ZikirPage })));
const LazyProfilePage = React.lazy(() => import('./components/ProfilePage').then(module => ({ default: module.ProfilePage })));
const LazyLeaderboardPage = React.lazy(() => import('./components/LeaderboardPage').then(module => ({ default: module.LeaderboardPage })));
const LazyStatsPage = React.lazy(() => import('./components/StatsPage').then(module => ({ default: module.StatsPage })));
const LazyNotificationsPanel = React.lazy(() => import('./components/NotificationsPanel').then(module => ({ default: module.NotificationsPanel })));
const LazyHatimRoomsPage = React.lazy(() => import('./components/HatimRoomsPage').then(module => ({ default: module.HatimRoomsPage })));
const LazyTutorialOverlay = React.lazy(() => import('./components/TutorialOverlay').then(module => ({ default: module.TutorialOverlay })));
const LazyQuranReader = React.lazy(() => import('./components/QuranReader').then(module => ({ default: module.QuranReader })));
const LazyLegalPage = React.lazy(() => import('./components/LegalPage').then(module => ({ default: module.LegalPage })));
const LazyDataDeletionPage = React.lazy(() => import('./components/DataDeletionPage').then(module => ({ default: module.DataDeletionPage })));
const LazyGoogleOneTap = React.lazy(() => import('./components/GoogleOneTap').then(module => ({ default: module.GoogleOneTap })));
const LazyChatPage = React.lazy(() => import('./components/ChatPage').then(module => ({ default: module.ChatPage })));

type View = 'home' | 'tasks' | 'history' | 'settings' | 'zikir' | 'hatim-rooms' | 'profile' | 'privacy' | 'terms' | 'data-deletion' | 'leaderboard' | 'stats' | 'chat';

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  async componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
    // If it's a chunk error, clear caches and reload
    if (error.message && error.message.toLowerCase().includes('chunk')) {
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (e) {}
      }
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        } catch (e) {}
      }
      window.location.href = window.location.origin + '/?t=' + new Date().getTime();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-xl font-bold text-white mb-4">Bir şeyler ters gitti</h1>
          <p className="text-white/60 mb-6">Uygulama yüklenirken bir sorun oluştu.</p>
          <button 
            onClick={async () => {
              if ('caches' in window) {
                try {
                  const cacheNames = await caches.keys();
                  await Promise.all(cacheNames.map(name => caches.delete(name)));
                } catch (e) {}
              }
              if ('serviceWorker' in navigator) {
                try {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  for (const registration of registrations) {
                    await registration.unregister();
                  }
                } catch (e) {}
              }
              window.location.href = window.location.origin + '/?t=' + new Date().getTime();
            }} 
            className="bg-white text-black px-8 py-3 rounded-2xl font-bold"
          >
            Yeniden Yükle
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // GSAP Animation for sidebar links and main content
    if (containerRef.current) {
      const tl = gsap.timeline({ delay: 0.2 });
      tl.from('.sidebar-link', {
        x: -20,
        opacity: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'all'
      })
      .from('.main-content-area', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'all'
      }, "-=0.2")
      .from('.bottom-nav', {
        y: 100,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'all'
      }, "-=0.3");
    }
  }, { scope: containerRef });

  const { updateAvailable, isChecking, lastCheckTime, checkStatus, checkForUpdates, applyUpdate, repo } = useGitHubUpdate();
  
  const location = useLocation();
  const navigate = useNavigate();

  const activeView = useMemo<View>(() => {
    const path = location.pathname;
    if (path.startsWith('/@')) return 'profile';
    if (path === '/privacy') return 'privacy';
    if (path === '/terms') return 'terms';
    if (path === '/data-deletion') return 'data-deletion';
    if (path === '/tasks') return 'tasks';
    if (path === '/history') return 'history';
    if (path === '/settings') return 'settings';
    if (path === '/leaderboard') return 'leaderboard';
    if (path === '/stats') return 'stats';
    if (path === '/chat') return 'chat';
    if (path === '/zikir') return 'zikir';
    if (path === '/hatim-rooms') return 'hatim-rooms';
    if (path === '/profile') return 'profile';
    return 'home';
  }, [location.pathname]);

  const setActiveView = (view: View) => {
    if (view === 'home') navigate('/');
    else navigate(`/${view}`);
  };

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [zikirJoinSessionId, setZikirJoinSessionId] = useState<string | null>(null);
  const [hatimJoinSessionId, setHatimJoinSessionId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);

  const { user, profile, loading: authLoading } = useAuth();

  const handleLogout = async () => {
    try {
      playClick();
      await signOut(auth);
      
      // Full reset logic to clear local data
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('local_zikir_tasks');
      
      const initialTaskId = crypto.randomUUID();
      setData({
        activeTaskId: initialTaskId,
        tasks: [{
          id: initialTaskId,
          name: "Tam Hatim",
          startPage: 1,
          endPage: QURAN_TOTAL_PAGES,
          currentPage: 0,
          isCompleted: false,
          createdAt: new Date().toISOString()
        }],
        logs: []
      });
      
      setActiveView('home');
      setIsMoreDrawerOpen(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    await applyUpdate();
  };
  
  const profileUsername = useMemo<string | undefined>(() => {
    const path = location.pathname;
    if (path.startsWith('/@')) {
      return path.substring(2);
    }
    return undefined;
  }, [location.pathname]);

  const setProfileUsername = (username: string | undefined) => {
    if (username) {
      navigate(`/@${username}`);
    } else {
      navigate('/profile');
    }
  };

  // Auto-reload on chunk errors
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (e.message.includes('Loading chunk') || e.message.includes('CSS chunk')) {
        window.location.reload();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pushSubscription, setPushSubscription] = useState<string | null>(null);

  // Initialize OneSignal
  useEffect(() => {
    const initOneSignal = async () => {
      try {
        const appId = import.meta.env.VITE_ONESIGNAL_APP_ID || "61205574-f992-486d-ae82-7b6632beb067";
        if (!appId) return;
        
        await OneSignal.init({
          appId: appId,
          safari_web_id: "web.onesignal.auto.4bead971-106d-461b-853f-83aecbd62d40",
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: false,
            prenotify: false,
            showCredit: false,
            text: {
              'tip.state.unsubscribed': 'Bildirimlere Abone Ol',
              'tip.state.subscribed': 'Bildirimlere Abone Oldunuz',
              'tip.state.blocked': 'Bildirimleri Engellediniz',
              'message.prenotify': 'Bildirimlere abone olmak ister misiniz?',
              'message.action.subscribed': 'Abonelik için teşekkürler!',
              'message.action.subscribing': 'Abone olunuyor...',
              'message.action.resubscribed': 'Tekrar hoş geldiniz!',
              'message.action.unsubscribed': 'Abonelikten ayrıldınız.',
              'dialog.main.title': 'Bildirim Ayarları',
              'dialog.main.button.subscribe': 'ABONE OL',
              'dialog.main.button.unsubscribe': 'ABONELİKTEN AYRIL',
              'dialog.blocked.title': 'Bildirimleri Açın',
              'dialog.blocked.message': 'Bildirimleri almak için tarayıcı ayarlarından izin verin.'
            }
          },
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: "push",
                  autoPrompt: true,
                  delay: {
                    pageViews: 1,
                    timeDelay: 5
                  },
                  text: {
                    actionMessage: "Hatim ve cüz hatırlatmaları için bildirimlere izin verin.",
                    acceptButton: "İzin Ver",
                    cancelButton: "İptal"
                  }
                }
              ]
            }
          }
        });

        if (user) {
          try {
            await OneSignal.login(user.uid);
          } catch (loginError) {
            console.log("OneSignal login error:", loginError);
          }
        }

        // Otomatik bildirim izni iste
        try {
          if (typeof window !== 'undefined' && window.Notification && Notification.permission === 'default') {
            await OneSignal.Slidedown.promptPush();
          }
        } catch (promptError) {
          console.log("Bildirim izni istenirken hata:", promptError);
        }

        // Get current subscription state
        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          setPushSubscription(subscriptionId);
          if (user) {
            await updateDoc(doc(db, 'users', user.uid), {
              pushSubscription: subscriptionId
            });
          }
        }

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener("change", async (event) => {
          if (event.current.id) {
            setPushSubscription(event.current.id);
            if (user) {
              await updateDoc(doc(db, 'users', user.uid), {
                pushSubscription: event.current.id
              });
            }
          }
        });
      } catch (e) {
        console.error("OneSignal init error:", e);
      }
    };

    initOneSignal();
  }, [user]);

  const requestNotificationPermission = async () => {
    try {
      await OneSignal.Slidedown.promptPush();
    } catch (error) {
      console.error('Bildirim izni alınırken hata:', error);
      alert('Bildirim izni alınırken bir hata oluştu.');
    }
  };

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    isInitialNotifLoad.current = true;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.docs.length);
      
      if (!isInitialNotifLoad.current && Notification.permission === 'granted') {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const notif = change.doc.data() as any;
            let body = 'Yeni bir bildiriminiz var.';
            if (notif.type === 'zikir_invite') {
              body = `${notif.senderName} sizi ${notif.sessionName} zikrine davet etti.`;
            } else if (notif.type === 'new_follower') {
              body = `${notif.senderName} sizi takip etmeye başladı.`;
            } else if (notif.type === 'system_announcement') {
              body = notif.title || notif.message || 'Sistem duyurusu.';
            }

            new Notification('HatimPro', {
              body: body,
              icon: '/favicon.svg'
            });
          }
        });
      }
      isInitialNotifLoad.current = false;
    }, (error) => {
      console.error("Notifications snapshot error:", error);
    });
    return () => unsubscribe();
  }, [user]);
  
  const [legalType, setLegalType] = useState<'privacy' | 'terms' | null>(null);

  // Auth Enforcement
  const handleProtectedAction = (action: () => void) => {
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      action();
    }
  };
  
  const [data, setData] = useState<HatimData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing saved data", e);
      }
    }
    
    // Default initial task
    const initialTaskId = crypto.randomUUID();
    const initialTask: HatimTask = {
      id: initialTaskId,
      name: "Tam Hatim",
      startPage: 1,
      endPage: QURAN_TOTAL_PAGES,
      currentPage: 0,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };

    return {
      activeTaskId: initialTaskId,
      tasks: [initialTask],
      logs: [],
    };
  });

  // Ensure XP is synced if missing
  useEffect(() => {
    if (user && !authLoading && data.logs.length > 0) {
      if (profile && (!profile.stats?.xp || profile.stats.xp === 0)) {
        syncDataToFirebase(user.uid, data);
      }
    }
  }, [user, authLoading, profile, data]);

  const [isAddLogOpen, setIsAddLogOpen] = useState(false);
  const [isQuranReaderOpen, setIsQuranReaderOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isJuzPickerOpen, setIsJuzPickerOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = useState(false);
  
  // 2FA States
  const [isEnrolling2FA, setIsEnrolling2FA] = useState(false);
  const [totpSecret, setTotpSecret] = useState<any>(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isMfaEnrolled, setIsMfaEnrolled] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordChangeTotp, setPasswordChangeTotp] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordResetTotp, setPasswordResetTotp] = useState('');
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState<string | null>(null);

  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Account Linking States
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  // Create Password States (for social login users)
  const [showCreatePasswordModal, setShowCreatePasswordModal] = useState(false);
  const [createPasswordInput, setCreatePasswordInput] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [createPasswordError, setCreatePasswordError] = useState<string | null>(null);

  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);

  const loadPasskeys = async () => {
    if (!user) return;
    try {
      setIsLoadingPasskeys(true);
      const keys = await getUserPasskeys();
      setPasskeys(keys);
    } catch (err) {
      console.error("Passkey yükleme hatası:", err);
    } finally {
      setIsLoadingPasskeys(false);
    }
  };

  useEffect(() => {
    if (user && activeView === 'settings') {
      loadPasskeys();
    }
  }, [user, activeView]);

  const handleRegisterPasskey = async () => {
    try {
      setPasskeyError(null);
      setPasskeySuccess(null);
      await registerPasskey();
      setPasskeySuccess('Biyometrik giriş (Passkey) başarıyla eklendi!');
      loadPasskeys();
    } catch (err: any) {
      setPasskeyError(err.message || 'Passkey eklenirken bir hata oluştu.');
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    try {
      setPasskeyError(null);
      setPasskeySuccess(null);
      await deletePasskey(credentialId);
      setPasskeySuccess('Biyometrik giriş başarıyla kaldırıldı.');
      loadPasskeys();
    } catch (err: any) {
      setPasskeyError(err.message || 'Passkey kaldırılırken bir hata oluştu.');
    }
  };

  // Check if user needs to create a password
  useEffect(() => {
    if (user && !authLoading) {
      const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
      if (!hasPasswordProvider && user.providerData.length > 0) {
        // User logged in with social provider but hasn't set a password yet
        // We check this only once per session or when user changes
        const hasSeenPrompt = sessionStorage.getItem('hasSeenPasswordPrompt');
        if (!hasSeenPrompt) {
          setShowCreatePasswordModal(true);
          sessionStorage.setItem('hasSeenPasswordPrompt', 'true');
        }
      }
    }
  }, [user, authLoading]);

  const handleLinkAccount = async (providerId: string) => {
    if (!user) return;
    setIsLinking(true);
    setLinkError(null);
    setLinkSuccess(null);

    try {
      let provider;
      if (providerId === 'github.com') {
        provider = new GithubAuthProvider();
      } else if (providerId === 'microsoft.com') {
        provider = new OAuthProvider('microsoft.com');
      } else if (providerId === 'google.com') {
        provider = new GoogleAuthProvider();
      } else if (providerId === 'facebook.com') {
        provider = new FacebookAuthProvider();
      } else {
        throw new Error('Geçersiz sağlayıcı.');
      }

      await linkWithPopup(user, provider);
      setLinkSuccess('Hesap başarıyla bağlandı.');
      
    } catch (error: any) {
      console.error("Link account error:", error);
      if (error.code === 'auth/credential-already-in-use') {
        setLinkError('Bu hesap zaten başka bir kullanıcıya bağlı.');
      } else {
        setLinkError('Hesap bağlanırken bir hata oluştu: ' + error.message);
      }
    } finally {
      setIsLinking(false);
    }
  };

  const handleCreatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (createPasswordInput !== createPasswordConfirm) {
      setCreatePasswordError('Şifreler eşleşmiyor.');
      return;
    }

    if (createPasswordInput.length < 6) {
      setCreatePasswordError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    try {
      await updatePassword(user, createPasswordInput);
      playSuccess();
      setShowCreatePasswordModal(false);
      setMfaSuccess('Şifreniz başarıyla oluşturuldu.'); // Reusing success message state or create new one
      // Clear inputs
      setCreatePasswordInput('');
      setCreatePasswordConfirm('');
    } catch (error: any) {
      console.error("Create password error:", error);
      setCreatePasswordError('Şifre oluşturulurken bir hata oluştu: ' + error.message);
    }
  };

  const handleBulkDeleteLogs = () => {
    if (selectedLogs.length === 0) return;
    
    setData(prev => {
      const filteredLogs = prev.logs.filter(log => !selectedLogs.includes(log.id));
      let updatedLogs = filteredLogs;
      
      const updatedTasks = prev.tasks.map(task => {
        const { logs: newLogs, latestAbsolutePage } = recalculateTaskLogs(updatedLogs, task);
        updatedLogs = newLogs;
        return {
          ...task,
          currentPage: latestAbsolutePage,
          isCompleted: latestAbsolutePage >= task.endPage
        };
      });
      return { ...prev, logs: updatedLogs, tasks: updatedTasks };
    });
    setSelectedLogs([]);
  };

  const handleBulkDeleteTasks = () => {
    if (selectedTasks.length === 0) return;
    if (data.tasks.length - selectedTasks.length < 1) {
      setErrorMessage("En az bir görev kalmalıdır.");
      return;
    }
    playDelete();
    setData(prev => {
      const remainingTasks = prev.tasks.filter(t => !selectedTasks.includes(t.id));
      const remainingLogs = prev.logs.filter(l => !selectedTasks.includes(l.taskId));
      const newActiveId = selectedTasks.includes(prev.activeTaskId) ? remainingTasks[0].id : prev.activeTaskId;
      return { ...prev, tasks: remainingTasks, logs: remainingLogs, activeTaskId: newActiveId };
    });
    setSelectedTasks([]);
  };

  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('hatim_sound_enabled');
    return saved === null ? true : saved === 'true';
  });

  const [isSplashEnabled, setIsSplashEnabled] = useState(() => {
    const saved = localStorage.getItem('hatim_splash_enabled');
    return saved === null ? true : saved === 'true';
  });

  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash if it's enabled and it's a fresh load (not handled by state persistence across views)
    return isSplashEnabled;
  });

  const [showTutorial, setShowTutorial] = useState(() => {
    const saved = localStorage.getItem('hatim_tutorial_seen');
    return saved !== 'true';
  });

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('hatim_tutorial_seen', 'true');
  };

  // Sounds removed
  const playClick = () => {};
  const playSuccess = () => {};
  const playDelete = () => {};
  const playOpen = () => {};
  
  // Form States
  const [newPageInput, setNewPageInput] = useState<string>('');
  const [newLogDate, setNewLogDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [startJuzSelection, setStartJuzSelection] = useState<number | null>(null);
  const [customStartPage, setCustomStartPage] = useState<string>('1');
  const [customEndPage, setCustomEndPage] = useState<string>('604');
  const [customTaskName, setCustomTaskName] = useState<string>('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  // Close AuthModal automatically when user logs in
  useEffect(() => {
    if (user && isAuthModalOpen) {
      setIsAuthModalOpen(false);
    }
  }, [user, isAuthModalOpen]);

  const isFirebaseSyncing = useRef(false);
  const isInitialLoad = useRef(true);
  const isInitialNotifLoad = useRef(true);

  // Check 2FA Enrollment status
  useEffect(() => {
    if (user && data.mfaEnabled) {
      setIsMfaEnrolled(true);
    } else {
      setIsMfaEnrolled(false);
    }
  }, [user, data.mfaEnabled]);

  // Listen to Firebase data
  useEffect(() => {
    if (user) {
      isInitialLoad.current = true;
      const unsubscribe = listenToFirebaseData(user.uid, (firebaseData) => {
        if (firebaseData) {
          setData(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(firebaseData)) {
              isFirebaseSyncing.current = true;
              return firebaseData;
            }
            return prev;
          });
        } else {
          // Firebase has no data, push local data
          if (isInitialLoad.current) {
            syncDataToFirebase(user.uid, data);
          }
        }
        isInitialLoad.current = false;
      });
      return () => unsubscribe();
    }
  }, [user, authLoading]);

  // Sync to Firebase when local data changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
    if (isFirebaseSyncing.current) {
      isFirebaseSyncing.current = false;
      return;
    }

    if (user && !isInitialLoad.current) {
      syncDataToFirebase(user.uid, data);
    }
  }, [data, user]);

  useEffect(() => {
    localStorage.setItem('hatim_sound_enabled', isSoundEnabled.toString());
  }, [isSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('hatim_splash_enabled', isSplashEnabled.toString());
  }, [isSplashEnabled]);

  useEffect(() => {
    if (!isSplashEnabled) {
      setShowSplash(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 800); // Reduced from 2500ms to 800ms for faster startup
    return () => clearTimeout(timer);
  }, [isSplashEnabled]);

  const activeTask = useMemo(() => {
    return data.tasks.find(t => t.id === data.activeTaskId) || data.tasks[0];
  }, [data.activeTaskId, data.tasks]);

  const activeTaskLogs = useMemo(() => {
    return data.logs
      .filter(l => l.taskId === activeTask.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.logs, activeTask.id]);

  const totalPagesInRange = useMemo(() => {
    return activeTask.endPage - activeTask.startPage + 1;
  }, [activeTask]);

  const pagesReadInRange = useMemo(() => {
    return activeTaskLogs.reduce((sum, log) => sum + log.pagesRead, 0);
  }, [activeTaskLogs]);

  const progress = useMemo(() => {
    if (totalPagesInRange <= 0) return 0;
    return Math.min(100, Math.max(0, (pagesReadInRange / totalPagesInRange) * 100));
  }, [pagesReadInRange, totalPagesInRange]);

  const handleAddLog = (e: FormEvent) => {
    e.preventDefault();
    const pagesReadInput = parseInt(newPageInput);
    if (isNaN(pagesReadInput) || pagesReadInput <= 0) return;

    // Check if adding these pages exceeds the task's end page
    const totalPagesRead = activeTaskLogs.reduce((sum, log) => sum + log.pagesRead, 0);
    const remainingPages = (activeTask.endPage - activeTask.startPage + 1) - totalPagesRead;
    
    if (remainingPages <= 0) {
      playDelete();
      setErrorMessage("Bu görev zaten tamamlanmış.");
      return;
    }

    const actualPagesRead = Math.min(pagesReadInput, remainingPages);

    playSuccess();

    // To handle multiple logs on the same day correctly, we append the current time to the selected date
    const now = new Date();
    const selectedDate = new Date(newLogDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate > today) {
      playDelete();
      setErrorMessage("Gelecek bir tarih için kayıt giremezsiniz.");
      return;
    }

    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    const newLog: ReadingLog = {
      id: crypto.randomUUID(),
      taskId: activeTask.id,
      date: selectedDate.toISOString(),
      pagesRead: actualPagesRead,
      absolutePage: 0, // Will be recalculated
    };

    // Apply a small trust score penalty for manual entries to discourage cheating
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      getDoc(userRef).then(userSnap => {
        if (userSnap.exists()) {
          const currentStats = userSnap.data()?.stats || {};
          const currentTrustScore = currentStats.trustScore ?? 100;
          // -2 penalty for unverified manual entry
          updateDoc(userRef, {
            'stats.trustScore': Math.max(0, currentTrustScore - 2)
          }).catch(console.error);
        }
      }).catch(console.error);
    }

    setData(prev => {
      const allLogs = [newLog, ...prev.logs];
      const { logs: newLogs, latestAbsolutePage } = recalculateTaskLogs(allLogs, activeTask);
      
      return {
        ...prev,
        logs: newLogs,
        tasks: prev.tasks.map(t => t.id === activeTask.id ? {
          ...t,
          currentPage: latestAbsolutePage,
          isCompleted: latestAbsolutePage >= t.endPage
        } : t)
      };
    });

    setNewPageInput('');
    setIsAddLogOpen(false);
  };

  const handleDeleteLog = (id: string) => {
    playDelete();
    setData(prev => {
      const filteredLogs = prev.logs.filter(log => log.id !== id);
      const { logs: newLogs, latestAbsolutePage } = recalculateTaskLogs(filteredLogs, activeTask);
      
      return {
        ...prev,
        logs: newLogs,
        tasks: prev.tasks.map(t => t.id === activeTask.id ? {
          ...t,
          currentPage: latestAbsolutePage,
          isCompleted: latestAbsolutePage >= t.endPage
        } : t)
      };
    });
  };

  const createNewTask = (name: string, start: number, end: number) => {
    const newId = crypto.randomUUID();
    const newTask: HatimTask = {
      id: newId,
      name: name,
      startPage: start,
      endPage: end,
      currentPage: 0,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };

    setData(prev => ({
      ...prev,
      tasks: [newTask, ...prev.tasks],
      activeTaskId: newId
    }));
    
    playSuccess();
    setIsAddTaskOpen(false);
    setIsJuzPickerOpen(false);
    setActiveView('home');
  };

  const handleJuzClick = (juz: number) => {
    
    if (startJuzSelection === null) {
      setStartJuzSelection(juz);
    } else {
      const startJuz = Math.min(startJuzSelection, juz);
      const endJuz = Math.max(startJuzSelection, juz);
      const start = JUZ_START_PAGES[startJuz - 1];
      const end = JUZ_START_PAGES[endJuz] - 1;
      
      // Instead of creating immediately, populate custom task fields
      setCustomTaskName(`${startJuz}-${endJuz}. Cüzler`);
      setCustomStartPage(start.toString());
      setCustomEndPage(end.toString());
      setStartJuzSelection(null);
      setIsJuzPickerOpen(false);
      
      // Scroll to custom task form or focus it
      const form = document.querySelector('form');
      form?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCustomTaskSubmit = (e: FormEvent) => {
    e.preventDefault();
    const start = parseInt(customStartPage);
    const end = parseInt(customEndPage);
    if (isNaN(start) || isNaN(end) || start <= 0 || end < start || end > QURAN_TOTAL_PAGES) return;
    createNewTask(customTaskName || `${start}-${end}. Sayfalar`, start, end);
  };

  const deleteTask = (id: string) => {
    if (data.tasks.length <= 1) {
      playDelete();
      setErrorMessage("En az bir görev bulunmalıdır.");
      return;
    }
    playClick();
    setTaskToDelete(id);
  };

  const confirmDeleteTask = () => {
    if (!taskToDelete) return;
    playDelete();
    const id = taskToDelete;
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id),
      logs: prev.logs.filter(l => l.taskId !== id),
      activeTaskId: prev.activeTaskId === id ? prev.tasks.find(t => t.id !== id)!.id : prev.activeTaskId
    }));
    setTaskToDelete(null);
  };

  const resetData = () => {
    playDelete();
    const initialTaskId = crypto.randomUUID();
    const initialTask: HatimTask = {
      id: initialTaskId,
      name: "Tam Hatim",
      startPage: 1,
      endPage: QURAN_TOTAL_PAGES,
      currentPage: 0,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };
    
    setData({
      activeTaskId: initialTaskId,
      tasks: [initialTask],
      logs: [],
    });
    setIsResetConfirmOpen(false);
    setActiveView('home');
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    if (newPassword !== newPasswordConfirm) {
      setPasswordChangeError("Yeni şifreler eşleşmiyor.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeError("Yeni şifre en az 6 karakter olmalıdır.");
      return;
    }

    if (isMfaEnrolled) {
      if (!passwordChangeTotp) {
        setPasswordChangeError("Lütfen 2FA kodunu girin.");
        return;
      }
      try {
        // Fetch secret from Firestore private subcollection
        const mfaDoc = await getDoc(doc(db, 'users', user.uid, 'private', 'mfa'));
        const mfaSecret = mfaDoc.data()?.secret;

        if (!mfaSecret) {
          setPasswordChangeError("2FA yapılandırması bulunamadı.");
          return;
        }

        const totp = new OTPAuth.TOTP({
          issuer: "Hatim Pro",
          label: user.email,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(mfaSecret),
        });
        const delta = totp.validate({ token: passwordChangeTotp, window: 1 });
        if (delta === null) {
          setPasswordChangeError("Girdiğiniz 2FA kodu hatalı veya süresi dolmuş.");
          return;
        }
      } catch (err) {
        console.error("2FA verify error:", err);
        setPasswordChangeError("2FA doğrulaması sırasında bir hata oluştu.");
        return;
      }
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      
      setPasswordChangeSuccess("Şifreniz başarıyla değiştirildi.");
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordChangeTotp('');
      setTimeout(() => setIsChangingPassword(false), 3000);
    } catch (error: any) {
      setPasswordChangeError(getFirebaseErrorMessage(error));
    }
  };

  const handleSendPasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    setPasswordResetError(null);
    setPasswordResetSuccess(null);

    if (isMfaEnrolled) {
      if (!passwordResetTotp) {
        setPasswordResetError("Lütfen 2FA kodunu girin.");
        return;
      }
      try {
        // Fetch secret from Firestore private subcollection
        const mfaDoc = await getDoc(doc(db, 'users', user.uid, 'private', 'mfa'));
        const mfaSecret = mfaDoc.data()?.secret;

        if (!mfaSecret) {
          setPasswordResetError("2FA yapılandırması bulunamadı.");
          return;
        }

        const totp = new OTPAuth.TOTP({
          issuer: "Hatim Pro",
          label: user.email,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(mfaSecret),
        });
        const delta = totp.validate({ token: passwordResetTotp, window: 1 });
        if (delta === null) {
          setPasswordResetError("Girdiğiniz 2FA kodu hatalı veya süresi dolmuş.");
          return;
        }
      } catch (err) {
        console.error("2FA verify error:", err);
        setPasswordResetError("2FA doğrulaması sırasında bir hata oluştu.");
        return;
      }
    }

    try {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, user.email, actionCodeSettings);
      setPasswordResetSuccess("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
      setPasswordResetTotp('');
      setTimeout(() => setIsResettingPassword(false), 3000);
    } catch (error: any) {
      setPasswordResetError(getFirebaseErrorMessage(error));
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      playDelete();
      // First delete data from Firestore
      await deleteDoc(doc(db, 'users', user.uid));
      // Then delete user account
      await deleteUser(user);
      
      // Reset local data
      resetData();
      setIsDeleteAccountConfirmOpen(false);
    } catch (error: any) {
      console.error("Error deleting account:", error);
      if (error.code === 'auth/requires-recent-login') {
        setErrorMessage("Hesabınızı silmek için güvenlik nedeniyle yeniden giriş yapmanız gerekmektedir. Lütfen çıkış yapıp tekrar giriş yapın ve tekrar deneyin.");
      } else {
        setErrorMessage("Hesap silinirken bir hata oluştu: " + getFirebaseErrorMessage(error));
      }
      setIsDeleteAccountConfirmOpen(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!user) return;
    setMfaError(null);
    setMfaSuccess(null);
    try {
      const secret = new OTPAuth.Secret({ size: 20 });
      setTotpSecret(secret.base32);
      setIsEnrolling2FA(true);
    } catch (error: any) {
      setMfaError("2FA başlatılırken hata oluştu.");
    }
  };

  const handleConfirm2FA = async () => {
    if (!user || !totpSecret || !totpCode) return;
    console.log("Confirming 2FA with secret:", totpSecret);
    setMfaError(null);
    try {
      const secret = OTPAuth.Secret.fromBase32(totpSecret);
      console.log("Secret parsed successfully");
      const totp = new OTPAuth.TOTP({
        issuer: "Hatim Pro",
        label: user.email || "Kullanıcı",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secret,
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      
      if (delta !== null) {
        // Save secret to Firestore securely in a private subcollection
        await setDoc(doc(db, 'users', user.uid, 'private', 'mfa'), {
          secret: totpSecret,
          enabled: true,
          updatedAt: new Date().toISOString()
        });

        // Update main user doc to reflect MFA status (but not the secret)
        await updateDoc(doc(db, 'users', user.uid), {
          mfaEnabled: true
        });

        setIsEnrolling2FA(false);
        setTotpSecret(null);
        setTotpCode('');
        setMfaSuccess('İki faktörlü doğrulama başarıyla etkinleştirildi.');
        setIsMfaEnrolled(true);
        setData(prev => ({ ...prev, mfaEnabled: true }));
      } else {
        setMfaError("Girdiğiniz kod hatalı veya süresi dolmuş.");
      }
    } catch (error: any) {
      console.error("2FA confirm error:", error);
      setMfaError("Doğrulama sırasında bir hata oluştu.");
    }
  };

  const handleDisable2FA = async () => {
    if (!user) return;
    setMfaError(null);
    setMfaSuccess(null);
    try {
      // Remove secret from private subcollection
      await deleteDoc(doc(db, 'users', user.uid, 'private', 'mfa'));

      // Update main user doc
      await updateDoc(doc(db, 'users', user.uid), {
        mfaEnabled: false
      });

      setMfaSuccess('İki faktörlü doğrulama devre dışı bırakıldı.');
      setIsMfaEnrolled(false);
      setData(prev => ({ ...prev, mfaEnabled: false }));
    } catch (error: any) {
      console.error("2FA disable error:", error);
      setMfaError("Devre dışı bırakılırken hata oluştu.");
    }
  };

  const [isReadingMode, setIsReadingMode] = useState(false);
  const [readingTime, setReadingTime] = useState(0);
  const [showCommitmentModal, setShowCommitmentModal] = useState(false);
  const readingIntervalRef = useRef<any>(null);

  const startReading = async () => {
    if (!user || !activeTask) return;
    playClick();
    setIsReadingMode(true);
    setReadingTime(0);
    
    // Update local task
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === activeTask.id ? { ...t, isReading: true, readingStartTime: new Date().toISOString() } : t)
    }));

    // Update global profile status
    await updateDoc(doc(db, 'users', user.uid), {
      isReading: true,
      currentReadingSession: {
        type: 'individual',
        id: activeTask.id,
        startTime: new Date().toISOString()
      }
    });

    readingIntervalRef.current = setInterval(() => {
      setReadingTime(prev => prev + 1);
    }, 1000);
  };

  const stopReading = async () => {
    if (!user || !activeTask) return;
    playClick();
    clearInterval(readingIntervalRef.current);
    setShowCommitmentModal(true);
  };

  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  const confirmReading = async () => {
    if (!user || !activeTask) return;
    
    const timeSpent = readingTime; // in seconds
    const pagesRead = parseInt(newPageInput) || 0;
    
    if (pagesRead <= 0) {
      setCommitmentError("Lütfen okuduğunuz sayfa sayısını girin.");
      return;
    }
    
    setCommitmentError(null);
    playSuccess();
    
    // Trust Score Logic
    // Average reading speed is ~2-3 mins per page (120-180s)
    // A Hafiz can read a page in ~45-60 seconds.
    // If < 15s per page, it's physically impossible to articulate (suspicious)
    let trustImpact = 0;
    if (pagesRead > 0) {
      const secondsPerPage = timeSpent / pagesRead;
      if (secondsPerPage < 15) {
        trustImpact = -5; // Suspiciously fast (cheating)
      } else {
        trustImpact = 2; // Good pace / Hafiz pace
      }
    }

    // Update stats in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const currentStats = userSnap.data()?.stats || {};
    const currentTrustScore = currentStats.trustScore ?? 100;
    const currentTotalTime = currentStats.totalReadingTime || 0;

    await updateDoc(userRef, {
      isReading: false,
      currentReadingSession: deleteField(),
      'stats.trustScore': Math.min(100, Math.max(0, currentTrustScore + trustImpact)),
      'stats.totalReadingTime': currentTotalTime + timeSpent
    });

    // Save the log
    const now = new Date();

    const newLog: ReadingLog = {
      id: crypto.randomUUID(),
      taskId: activeTask.id,
      date: now.toISOString(),
      pagesRead: pagesRead,
      absolutePage: 0,
    };

    setData(prev => {
      const allLogs = [newLog, ...prev.logs];
      const { logs: newLogs, latestAbsolutePage } = recalculateTaskLogs(allLogs, activeTask);
      
      return {
        ...prev,
        logs: newLogs,
        tasks: prev.tasks.map(t => t.id === activeTask.id ? {
          ...t,
          currentPage: latestAbsolutePage,
          isCompleted: latestAbsolutePage >= t.endPage,
          isReading: false,
          totalReadingTime: (t.totalReadingTime || 0) + timeSpent
        } : t)
      };
    });

    setIsReadingMode(false);
    setShowCommitmentModal(false);
    setNewPageInput('');
    setIsAddLogOpen(false);
  };

  const cancelReading = async () => {
    if (!user || !activeTask) return;
    playClick();
    clearInterval(readingIntervalRef.current);
    setIsReadingMode(false);
    setShowCommitmentModal(false);
    
    await updateDoc(doc(db, 'users', user.uid), {
      isReading: false,
      currentReadingSession: deleteField()
    });

    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === activeTask.id ? { ...t, isReading: false } : t)
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Views
  const renderHome = () => (
    <div className="space-y-8 pb-24">
      {/* Range Info Badge */}
      <div className="flex justify-center">
        <div className="bg-sage-100/50 border border-sage-200 rounded-full px-4 py-1.5 flex items-center gap-2 text-sage-700 text-sm font-medium max-w-full overflow-hidden">
          <Info size={14} className="shrink-0" />
          <span className="overflow-x-auto whitespace-nowrap custom-scrollbar pb-1 max-w-full block">{activeTask.name}: {activeTask.startPage} - {activeTask.endPage}</span>
        </div>
      </div>

      {/* Progress Card */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-sage-100 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <BookOpen size={120} />
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
          <div>
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-sage-600 dark:text-neutral-300">İlerleme</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl sm:text-5xl font-bold text-sage-800 dark:text-white">{progress.toFixed(1)}%</span>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-sage-600 dark:text-neutral-300">Mevcut Sayfa</span>
            <div className="text-xl sm:text-2xl font-bold text-sage-700 dark:text-white">
              {activeTask.currentPage || activeTask.startPage} <span className="text-sage-300 font-normal">/</span> {activeTask.endPage}
            </div>
          </div>
        </div>

        <div className="h-3 sm:h-4 bg-sage-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-sage-500 rounded-full"
          />
        </div>
        
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-sage-50 dark:bg-neutral-800 rounded-2xl p-3 sm:p-4 flex items-center gap-3">
            <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-sage-600 dark:text-neutral-300 font-semibold uppercase tracking-tighter">Kalan</p>
              <p className="text-base sm:text-lg font-bold text-sage-800 dark:text-white">{Math.max(0, totalPagesInRange - pagesReadInRange)}</p>
            </div>
          </div>
          <div className="bg-sage-50 dark:bg-neutral-800 rounded-2xl p-3 sm:p-4 flex items-center gap-3">
            <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-sage-600 dark:text-neutral-300 font-semibold uppercase tracking-tighter">Okunan</p>
              <p className="text-base sm:text-lg font-bold text-sage-800 dark:text-white">{pagesReadInRange}</p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Quick Actions */}
      <div className="flex flex-col gap-4">
        {isReadingMode ? (
          <div className="bg-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-900/20 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm font-bold uppercase tracking-widest">Şu an okunuyor</span>
            </div>
            <div className="text-5xl font-mono font-bold mb-6">{formatTime(readingTime)}</div>
            <LiquidGlassButton 
              onClick={stopReading}
              className="w-full py-4 px-6 font-bold flex items-center justify-center gap-2 text-emerald-600 bg-white"
              intensity="heavy"
            >
              <CheckCircle2 size={20} />
              Okumayı Bitir
            </LiquidGlassButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-4">
              <LiquidGlassButton 
                onClick={() => handleProtectedAction(startReading)}
                className="flex-1 py-4 px-6 font-bold flex items-center justify-center gap-2 text-white"
                intensity="heavy"
              >
                <Book size={20} />
                Okumaya Başla
              </LiquidGlassButton>
              <button 
                onClick={() => handleProtectedAction(() => { setIsAddLogOpen(true); })}
                className="p-4 bg-white dark:bg-neutral-800 border border-sage-200 dark:border-neutral-700 rounded-2xl text-sage-600 dark:text-white hover:bg-sage-50 transition-colors"
                title="Manuel Kayıt Ekle"
              >
                <Plus size={24} />
              </button>
            </div>
            <button 
              onClick={() => handleProtectedAction(() => {  setIsQuranReaderOpen(true); })}
              className="w-full py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:opacity-90 transition-opacity"
            >
              <Mic size={20} />
              Sesli Kur'an Oku
            </button>
            <p className="text-[10px] text-sage-600 dark:text-neutral-400 text-center px-4">
              💡 Bugünün kaydı için <strong>Okumaya Başla</strong> butonunu kullanın. <br />
              <strong>+</strong> butonu sadece geçmiş günler için kayıt yapmanızı sağlar.
            </p>
          </div>
        )}
      </div>

      {/* Recent History for Active Task */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <HistoryIcon size={18} className="text-sage-600" />
            <h2 className="text-lg font-bold text-sage-800">Son Okumalar</h2>
          </div>
          <button onClick={() => { setActiveView('history'); }} className="text-sage-700 dark:text-sage-300 text-sm font-semibold hover:underline">Tümü</button>
        </div>

        <div className="space-y-3">
          {activeTaskLogs.slice(0, 5).map((log) => (
            <div key={log.id} className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-sage-100 dark:border-neutral-800 shadow-sm flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="bg-sage-50 dark:bg-neutral-800 p-3 rounded-xl text-sage-600 dark:text-sage-400">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-sage-800 dark:text-white">
                    {new Date(log.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs text-sage-600 dark:text-neutral-400">
                    {log.pagesRead} sayfa • <span className="font-semibold text-sage-800 dark:text-neutral-300">Sayfa {log.absolutePage}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteLog(log.id)}
                className="p-2 text-sage-200 dark:text-neutral-600 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {activeTaskLogs.length === 0 && (
            <div className="bg-white/50 dark:bg-sage-100/50 border border-dashed border-sage-300 dark:border-sage-500 rounded-2xl p-12 text-center">
              <p className="text-sage-600 dark:text-white italic">Henüz bir kayıt bulunmuyor.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="pt-8 pb-4 text-center text-xs text-sage-600 dark:text-neutral-400">
        <div className="flex justify-center gap-4 mb-2">
          <a href="/privacy" onClick={(e) => { e.preventDefault(); setActiveView('privacy'); }} className="text-sage-600 dark:text-neutral-400 hover:text-sage-900 dark:hover:text-neutral-200 transition-colors">Gizlilik Politikası</a>
          <span>•</span>
          <a href="/terms" onClick={(e) => { e.preventDefault(); setActiveView('terms'); }} className="text-sage-600 dark:text-neutral-400 hover:text-sage-900 dark:hover:text-neutral-200 transition-colors">Kullanım Koşulları</a>
        </div>
        <p>© 2026 HatimPro. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-2xl font-bold text-sage-800 dark:text-white">Görevlerim</h2>
        <div className="flex items-center gap-2">
          {selectedTasks.length > 0 && (
            <button 
              onClick={handleBulkDeleteTasks}
              className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            >
              <Trash2 size={16} />
              Sil ({selectedTasks.length})
            </button>
          )}
          <LiquidGlassButton 
            onClick={() => handleProtectedAction(() => { playOpen(); setIsAddTaskOpen(true); })}
            className="p-2 text-white"
            intensity="light"
          >
            <Plus size={24} />
          </LiquidGlassButton>
        </div>
      </div>

      <div className="space-y-4">
        {data.tasks.map((task) => {
          const isCurrent = task.id === data.activeTaskId;
          const taskLogs = data.logs.filter(l => l.taskId === task.id);
          const taskPagesRead = taskLogs.reduce((sum, log) => sum + log.pagesRead, 0);
          const taskTotalPages = task.endPage - task.startPage + 1;
          const taskProgress = Math.min(100, (taskPagesRead / taskTotalPages) * 100);
          
          return (
            <motion.div 
              key={task.id}
              layout
              className={`bg-white dark:bg-neutral-900 rounded-3xl p-6 border-2 transition-all flex items-start gap-4 ${isCurrent ? 'border-sage-500 dark:border-white shadow-md' : 'border-transparent dark:border-neutral-800 shadow-sm'}`}
            >
              <button 
                onClick={() => {
                  playClick();
                  setSelectedTasks(prev => 
                    prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                  );
                }}
                className={`mt-1 transition-colors ${selectedTasks.includes(task.id) ? 'text-sage-600 dark:text-white' : 'text-sage-200 dark:text-neutral-600'}`}
              >
                {selectedTasks.includes(task.id) ? <CheckSquare size={22} /> : <Square size={22} />}
              </button>

              <div className="flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div onClick={() => { playClick(); setData(prev => ({ ...prev, activeTaskId: task.id })); setActiveView('home'); }} className="cursor-pointer flex-1 min-w-0 pr-2">
                    <h3 className="text-lg font-bold text-sage-800 dark:text-white flex items-center gap-2">
                      <span className="overflow-x-auto whitespace-nowrap custom-scrollbar pb-1 max-w-full block">{task.name}</span>
                      {task.isCompleted && <CheckCircle2 size={18} className="text-emerald-500 dark:text-white shrink-0" />}
                    </h3>
                    <p className="text-sm text-sage-500 dark:text-neutral-400">{task.startPage} - {task.endPage}. Sayfalar</p>
                  </div>
                  <button 
                    onClick={() => deleteTask(task.id)}
                    className="text-sage-200 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 p-2"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-sage-500 dark:text-neutral-400">
                    <span>{taskProgress.toFixed(1)}%</span>
                    <span>{taskPagesRead} / {taskTotalPages} Sayfa</span>
                  </div>
                  <div className="h-2 bg-sage-50 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-sage-500 dark:bg-white rounded-full transition-all duration-1000"
                      style={{ width: `${taskProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-2xl font-bold text-sage-800">Tüm Geçmiş</h2>
        {selectedLogs.length > 0 && (
          <button 
            onClick={handleBulkDeleteLogs}
            className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} />
            Sil ({selectedLogs.length})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {data.logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log) => {
          const task = data.tasks.find(t => t.id === log.taskId);
          const isSelected = selectedLogs.includes(log.id);

          return (
            <div key={log.id} className={`bg-white dark:bg-neutral-900 rounded-2xl p-4 border transition-all flex items-center gap-4 ${isSelected ? 'border-sage-500 dark:border-white bg-sage-50/30 dark:bg-neutral-800' : 'border-sage-100 dark:border-neutral-800 shadow-sm'}`}>
              <button 
                onClick={() => {
                  playClick();
                  setSelectedLogs(prev => 
                    prev.includes(log.id) ? prev.filter(id => id !== log.id) : [...prev, log.id]
                  );
                }}
                className={`transition-colors ${isSelected ? 'text-sage-600 dark:text-white' : 'text-sage-200 dark:text-neutral-600'}`}
              >
                {isSelected ? <CheckSquare size={22} /> : <Square size={22} />}
              </button>

              <div className="flex-1 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-sage-50 dark:bg-neutral-800 p-3 rounded-xl text-sage-600 dark:text-white">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-sage-800 dark:text-white">
                      {new Date(log.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-sage-600 dark:text-neutral-400">
                      {task?.name || 'Silinmiş Görev'} • {log.pagesRead} sayfa • <span className="font-semibold text-sage-700 dark:text-neutral-300">Sayfa {log.absolutePage}</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteLog(log.id)}
                  className="p-2 text-sage-200 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 transition-opacity"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
        {data.logs.length === 0 && (
          <div className="bg-white/50 dark:bg-neutral-900/50 border border-dashed border-sage-300 dark:border-neutral-700 rounded-2xl p-12 text-center">
            <p className="text-sage-500 dark:text-neutral-400 italic">Henüz bir geçmiş kaydı bulunmuyor.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-8 pb-24">
      <div className="flex items-center gap-4 px-2">
        <button onClick={() => { playClick(); setActiveView('home'); }} className="p-2 hover:bg-sage-100 dark:hover:bg-neutral-800 rounded-full">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold text-sage-800 dark:text-white">Ayarlar</h2>
      </div>
      
      <div className="space-y-4">
        <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
          <h3 className="text-sm font-bold text-sage-500 dark:text-neutral-400 uppercase tracking-widest mb-4">Hesap & Eşitleme</h3>
          
          <div className="space-y-4">
            {user ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-50 dark:bg-neutral-800 p-2 rounded-lg text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sage-800 dark:text-white">Giriş Yapıldı</p>
                    <p className="text-xs text-sage-600 dark:text-neutral-300">{user.email}</p>
                  </div>
                </div>

                {/* Notification Permission */}
                <div className="flex items-center justify-between p-4 bg-sage-50 dark:bg-neutral-800 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                      <Bell size={20} />
                    </div>
                    <span className="font-bold text-sage-800 dark:text-white text-sm">Bildirim İzni</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={requestNotificationPermission}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                        Notification.permission === 'granted' 
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                          : 'bg-black text-white hover:bg-neutral-800'
                      }`}
                    >
                      {Notification.permission === 'granted' ? 'İzin Verildi' : 'İzin Ver'}
                    </button>
                    {Notification.permission === 'granted' && (
                      <button 
                        onClick={async () => {
                          try {
                            // Fetch the OneSignal subscription ID
                            let currentSub = OneSignal.User.PushSubscription.id;

                            if (!currentSub) {
                              setNotificationMsg({ type: 'error', text: 'OneSignal abonelik ID alınamadı. Lütfen sayfayı yenileyip tekrar deneyin.' });
                              return;
                            }

                            const response = await fetch('/api/notifications/send', {
                              method: 'POST',
                              body: JSON.stringify({
                                title: 'Hatim Pro Test',
                                body: 'Sunucu üzerinden gönderilen test bildirimi!',
                                url: '/',
                                subscription: user?.uid || currentSub
                              }),
                              headers: { 'content-type': 'application/json' }
                            });
                            
                            if (response.ok) {
                              const resData = await response.json();
                              if (resData.warning) {
                                setNotificationMsg({ type: 'error', text: resData.warning });
                              } else {
                                setNotificationMsg({ type: 'success', text: 'Test bildirimi gönderildi!' });
                                setTimeout(() => setNotificationMsg(null), 3000);
                              }
                            } else {
                              const errData = await response.json();
                              setNotificationMsg({ type: 'error', text: `Hata: ${errData.error || errData.details || response.statusText}` });
                            }
                          } catch (e: any) {
                            console.error(e);
                            setNotificationMsg({ type: 'error', text: `Bağlantı hatası: ${e.message}` });
                          }
                        }}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        Test Et
                      </button>
                    )}
                  </div>
                </div>
                {notificationMsg && (
                  <div className={`mt-2 p-2 rounded-lg text-xs font-bold text-white text-center ${notificationMsg.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    {notificationMsg.text}
                  </div>
                )}

                {/* 2FA Section */}
                <div className="mt-4 p-4 bg-sage-50 dark:bg-neutral-800 rounded-2xl border border-sage-100 dark:border-neutral-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Key size={18} className="text-sage-600 dark:text-white" />
                      <span className="font-bold text-sage-800 dark:text-white text-sm">İki Faktörlü Doğrulama (2FA)</span>
                    </div>
                    {isMfaEnrolled ? (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-neutral-700 px-2 py-1 rounded-md">Aktif</span>
                    ) : (
                      <span className="text-xs font-bold text-sage-500 dark:text-white bg-sage-200 dark:bg-neutral-700 px-2 py-1 rounded-md">Pasif</span>
                    )}
                  </div>
                  
                  {mfaError && <p className="text-xs text-red-600 mb-2">{mfaError}</p>}
                  {mfaSuccess && <p className="text-xs text-emerald-600 dark:text-sage-300 mb-2">{mfaSuccess}</p>}

                  {isEnrolling2FA && totpSecret ? (
                    <div className="mt-4 space-y-4">
                      <p className="text-xs text-sage-600">
                        1. Authenticator uygulamanızı (Google Authenticator, Authy vb.) açın ve aşağıdaki QR kodu okutun:
                      </p>
                      <div className="bg-white p-4 rounded-xl flex justify-center">
                        <QRCodeSVG 
                          value={`otpauth://totp/HatimPro:${user.email || 'Kullanıcı'}?secret=${totpSecret}&issuer=HatimPro`} 
                          size={150} 
                        />
                      </div>
                      <p className="text-xs text-sage-600 dark:text-sage-300 text-center font-mono bg-white dark:bg-sage-800 p-2 rounded-lg border border-sage-100 dark:border-sage-700">
                        {totpSecret}
                      </p>
                      <p className="text-xs text-sage-600">
                        2. Uygulamada görünen 6 haneli kodu aşağıya girin:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value)}
                          maxLength={6}
                          placeholder="000000"
                          className="flex-1 px-3 py-2 border border-sage-200 rounded-lg text-center tracking-widest font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
                        />
                        <button
                          onClick={handleConfirm2FA}
                          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-800 transition-colors"
                        >
                          Onayla
                        </button>
                      </div>
                      <button
                        onClick={() => { setIsEnrolling2FA(false); setTotpSecret(null); setMfaError(null); }}
                        className="w-full text-xs text-sage-600 hover:text-sage-800 font-medium mt-2"
                      >
                        İptal Et
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={isMfaEnrolled ? handleDisable2FA : handleEnable2FA}
                      className={`w-full py-2 mt-2 rounded-xl text-sm font-bold transition-colors ${
                        isMfaEnrolled 
                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                          : 'bg-black text-white hover:bg-neutral-800'
                      }`}
                    >
                      {isMfaEnrolled ? '2FA\'yı Devre Dışı Bırak' : '2FA\'yı Etkinleştir'}
                    </button>
                  )}
                </div>

                <button 
                  onClick={() => { 
                    playClick(); 
                    handleLogout().then(() => {
                      setIsAuthModalOpen(true);
                    });
                  }}
                  className="w-full py-3 text-sage-600 font-bold bg-sage-50 rounded-xl hover:bg-sage-100 transition-colors mt-2"
                >
                  Çıkış Yap
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-sage-600">
                  Cihazlar arası veri eşitlemesi için giriş yapın veya kayıt olun.
                </p>
                <LiquidGlassButton 
                  onClick={() => { playClick(); setIsAuthModalOpen(true); }}
                  className="w-full py-4 text-white font-bold"
                  intensity="heavy"
                >
                  Giriş Yap / Kayıt Ol
                </LiquidGlassButton>
              </div>
            )}
          </div>
        </section>

        {user && (
          <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
            <h3 className="text-sm font-bold text-sage-500 dark:text-white uppercase tracking-widest mb-4">Şifre İşlemleri</h3>
            
            <div className="space-y-4">
              {/* Password Operations */}
              {user.providerData.some(p => p.providerId === 'password') ? (
                /* Change Password */
                <div className="border border-sage-100 dark:border-neutral-800 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setIsChangingPassword(!isChangingPassword)}
                    className="w-full flex items-center justify-between p-4 bg-sage-50 dark:bg-neutral-800 hover:bg-sage-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
                        <Lock size={20} />
                      </div>
                      <span className="font-bold text-sage-800 dark:text-white">Şifre Değiştir</span>
                    </div>
                    <ChevronRight size={20} className={`text-sage-400 transition-transform ${isChangingPassword ? 'rotate-90' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isChangingPassword && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <form onSubmit={handleChangePassword} className="p-4 bg-white dark:bg-neutral-900 space-y-4 border-t border-sage-100 dark:border-neutral-800">
                          {passwordChangeError && <p className="text-xs text-red-600">{passwordChangeError}</p>}
                          {passwordChangeSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{passwordChangeSuccess}</p>}
                          
                          <div>
                            <label className="block text-xs font-bold text-sage-600 dark:text-white mb-1">Mevcut Şifre</label>
                            <input
                              type="password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-sage-50 dark:bg-neutral-800 border border-sage-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 dark:text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-sage-600 mb-1">Yeni Şifre</label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              required
                              minLength={6}
                              className="w-full px-3 py-2 bg-sage-50 border border-sage-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-sage-600 mb-1">Yeni Şifre (Tekrar)</label>
                            <input
                              type="password"
                              value={newPasswordConfirm}
                              onChange={(e) => setNewPasswordConfirm(e.target.value)}
                              required
                              minLength={6}
                              className="w-full px-3 py-2 bg-sage-50 border border-sage-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm"
                            />
                          </div>
                          {isMfaEnrolled && (
                            <div>
                              <label className="block text-xs font-bold text-sage-600 mb-1">2FA Kodu</label>
                              <input
                                type="text"
                                value={passwordChangeTotp}
                                onChange={(e) => setPasswordChangeTotp(e.target.value)}
                                required
                                maxLength={6}
                                placeholder="000000"
                                className="w-full px-3 py-2 bg-sage-50 border border-sage-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm font-mono tracking-widest"
                              />
                            </div>
                          )}
                          <button
                            type="submit"
                            className="w-full bg-sage-600 hover:bg-sage-700 text-white font-bold py-2 rounded-xl transition-colors text-sm"
                          >
                            Şifreyi Güncelle
                          </button>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                /* Create Password */
                <div className="border border-sage-100 dark:border-neutral-800 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowCreatePasswordModal(true)}
                    className="w-full flex items-center justify-between p-4 bg-sage-50 dark:bg-neutral-800 hover:bg-sage-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
                        <Key size={20} />
                      </div>
                      <span className="font-bold text-sage-800 dark:text-white">Şifre Oluştur</span>
                    </div>
                    <ChevronRight size={20} className="text-sage-400" />
                  </button>
                </div>
              )}



              {/* Account Linking */}
              <div className="border border-sage-100 dark:border-neutral-800 rounded-2xl overflow-hidden mt-4">
                 <div className="p-4 bg-sage-50 dark:bg-neutral-800 border-b border-sage-100 dark:border-neutral-700">
                    <div className="flex items-center gap-3">
                      <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
                        <Link size={20} />
                      </div>
                      <span className="font-bold text-sage-800 dark:text-white">Hesap Bağlantıları</span>
                    </div>
                 </div>
                 <div className="p-4 bg-white dark:bg-neutral-900 space-y-3">
                    {linkError && <p className="text-xs text-red-600">{linkError}</p>}
                    {linkSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{linkSuccess}</p>}
                    
                    {/* Google */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <span className="font-semibold text-sage-700 dark:text-white text-sm">Google</span>
                         {user.providerData.some(p => p.providerId === 'google.com') && (
                           <span className="text-[10px] bg-emerald-100 dark:bg-neutral-700 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">Bağlı</span>
                         )}
                      </div>
                      {!user.providerData.some(p => p.providerId === 'google.com') && (
                        <button 
                          onClick={() => handleLinkAccount('google.com')}
                          disabled={isLinking}
                          className="text-xs bg-sage-100 dark:bg-neutral-800 hover:bg-sage-200 dark:hover:bg-neutral-700 text-sage-700 dark:text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Bağla
                        </button>
                      )}
                    </div>

                    {/* Github */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <span className="font-semibold text-sage-700 dark:text-white text-sm">GitHub</span>
                         {user.providerData.some(p => p.providerId === 'github.com') && (
                           <span className="text-[10px] bg-emerald-100 dark:bg-neutral-700 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">Bağlı</span>
                         )}
                      </div>
                      {!user.providerData.some(p => p.providerId === 'github.com') && (
                        <button 
                          onClick={() => handleLinkAccount('github.com')}
                          disabled={isLinking}
                          className="text-xs bg-sage-100 dark:bg-neutral-800 hover:bg-sage-200 dark:hover:bg-neutral-700 text-sage-700 dark:text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Bağla
                        </button>
                      )}
                    </div>

                    {/* Microsoft */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <span className="font-semibold text-sage-700 dark:text-white text-sm">Microsoft</span>
                         {user.providerData.some(p => p.providerId === 'microsoft.com') && (
                           <span className="text-[10px] bg-emerald-100 dark:bg-neutral-700 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">Bağlı</span>
                         )}
                      </div>
                      {!user.providerData.some(p => p.providerId === 'microsoft.com') && (
                        <button 
                          onClick={() => handleLinkAccount('microsoft.com')}
                          disabled={isLinking}
                          className="text-xs bg-sage-100 dark:bg-neutral-800 hover:bg-sage-200 dark:hover:bg-neutral-700 text-sage-700 dark:text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Bağla
                        </button>
                      )}
                    </div>
                 </div>
              </div>

              {/* Passkey Security */}
              <div className="border border-sage-100 dark:border-neutral-800 rounded-2xl overflow-hidden mt-4">
                 <div className="p-4 bg-sage-50 dark:bg-neutral-800 border-b border-sage-100 dark:border-neutral-700">
                    <div className="flex items-center gap-3">
                      <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg text-sage-600 dark:text-white shadow-sm">
                        <Fingerprint size={20} />
                      </div>
                      <span className="font-bold text-sage-800 dark:text-white">Biyometrik Güvenlik</span>
                    </div>
                 </div>
                 <div className="p-4 bg-white dark:bg-neutral-900 space-y-3">
                    {passkeyError && <p className="text-xs text-red-600 font-bold">{passkeyError}</p>}
                    {passkeySuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">{passkeySuccess}</p>}
                    
                    {isLoadingPasskeys ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-sage-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : passkeys.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <p className="text-xs font-bold text-sage-500 dark:text-neutral-400 uppercase tracking-wider">Kayıtlı Cihazlar</p>
                        {passkeys.map(pk => (
                          <div key={pk.id} className="flex items-center justify-between bg-sage-50 dark:bg-neutral-800 p-3 rounded-xl border border-sage-100 dark:border-neutral-700">
                            <div className="flex items-center gap-3">
                              <div className="bg-white dark:bg-neutral-700 p-2 rounded-lg">
                                <Fingerprint size={16} className="text-sage-600 dark:text-sage-400" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-sage-800 dark:text-white">
                                  Passkey
                                </span>
                                <span className="text-[10px] text-sage-500 dark:text-neutral-400">
                                  {new Date(pk.createdAt).toLocaleDateString('tr-TR')}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeletePasskey(pk.id)}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Kaldır"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={handleRegisterPasskey}
                      className="w-full bg-sage-100 dark:bg-neutral-800 hover:bg-sage-200 dark:hover:bg-neutral-700 text-sage-800 dark:text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <Fingerprint size={18} />
                      Biyometrik Giriş (Passkey) Ekle
                    </button>
                    <p className="text-xs text-sage-600 dark:text-neutral-400 text-center">
                      Cihazınızın parmak izi veya yüz tanıma özelliğini kullanarak şifresiz giriş yapabilirsiniz.
                    </p>
                 </div>
              </div>
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
          <h3 className="text-sm font-bold text-sage-500 dark:text-white uppercase tracking-widest mb-4">Uygulama Ayarları</h3>
          
          <div className="space-y-6">
            {/* Notification Permission */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-sage-50 dark:bg-neutral-800 p-2 rounded-lg text-sage-600 dark:text-white">
                  <Bell size={20} />
                </div>
                <div>
                  <p className="font-bold text-sage-800 dark:text-white">Bildirimler</p>
                  <p className="text-xs text-sage-600 dark:text-neutral-300">Masaüstü bildirimlerini aç</p>
                </div>
              </div>
              <button 
                onClick={requestNotificationPermission}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  Notification.permission === 'granted' 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                    : 'bg-sage-200 text-sage-700 dark:bg-neutral-700 dark:text-white hover:bg-sage-300'
                }`}
              >
                {Notification.permission === 'granted' ? 'İzin Verildi' : 'İzin Ver'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-sage-50 dark:bg-neutral-800 p-2 rounded-lg text-sage-600 dark:text-white">
                  {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </div>
                <div>
                  <p className="font-bold text-sage-800 dark:text-white">Ses Efektleri</p>
                  <p className="text-xs text-sage-600 dark:text-neutral-300">Etkileşimlerde ses çal</p>
                </div>
              </div>
              <button 
                onClick={() => { playClick(); setIsSoundEnabled(!isSoundEnabled); }}
                className={`w-12 h-6 rounded-full transition-colors relative ${isSoundEnabled ? 'bg-sage-500 dark:bg-white' : 'bg-sage-200 dark:bg-neutral-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-black rounded-full transition-all ${isSoundEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-sage-50 dark:bg-neutral-800 p-2 rounded-lg text-sage-600 dark:text-white">
                  <LayoutGrid size={20} />
                </div>
                <div>
                  <p className="font-bold text-sage-800 dark:text-white">Açılış Ekranı</p>
                  <p className="text-xs text-sage-600 dark:text-neutral-300">Uygulama açılırken splash göster</p>
                </div>
              </div>
              <button 
                onClick={() => { playClick(); setIsSplashEnabled(!isSplashEnabled); }}
                className={`w-12 h-6 rounded-full transition-colors relative ${isSplashEnabled ? 'bg-sage-500 dark:bg-white' : 'bg-sage-200 dark:bg-neutral-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white dark:bg-black rounded-full transition-all ${isSplashEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
          <h3 className="text-sm font-bold text-sage-500 dark:text-white uppercase tracking-widest mb-4">Yapay Zeka Kullanımı</h3>
          
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-sage-50 dark:bg-neutral-800 p-2 rounded-lg text-sage-600 dark:text-white">
                <Bot size={20} />
              </div>
              <div>
                <p className="font-bold text-sage-800 dark:text-white">Asistan Kullanım Bilgileri</p>
                <p className="text-xs text-sage-600 dark:text-neutral-300">Günlük ve saatlik kullanım limitleriniz</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Minute Limit */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-sage-600 dark:text-neutral-400">Dakikalık Limit</span>
                  <span className="text-sage-800 dark:text-white">
                    {data.aiUsage?.minute.timestamp === Math.floor(Date.now() / 60000) ? data.aiUsage.minute.count : 0} / {AI_LIMITS.minute}
                  </span>
                </div>
                <div className="h-2 bg-sage-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((data.aiUsage?.minute.timestamp === Math.floor(Date.now() / 60000) ? data.aiUsage.minute.count : 0) / AI_LIMITS.minute) * 100)}%` }}
                    className="h-full bg-sage-500"
                  />
                </div>
              </div>

              {/* Hour Limit */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-sage-600 dark:text-neutral-400">Saatlik Limit</span>
                  <span className="text-sage-800 dark:text-white">
                    {data.aiUsage?.hour.timestamp === Math.floor(Date.now() / 3600000) ? data.aiUsage.hour.count : 0} / {AI_LIMITS.hour}
                  </span>
                </div>
                <div className="h-2 bg-sage-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((data.aiUsage?.hour.timestamp === Math.floor(Date.now() / 3600000) ? data.aiUsage.hour.count : 0) / AI_LIMITS.hour) * 100)}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
              </div>

              {/* Day Limit */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-sage-600 dark:text-neutral-400">Günlük Limit</span>
                  <span className="text-sage-800 dark:text-white">
                    {data.aiUsage?.day.timestamp === Math.floor(Date.now() / 86400000) ? data.aiUsage.day.count : 0} / {AI_LIMITS.day}
                  </span>
                </div>
                <div className="h-2 bg-sage-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((data.aiUsage?.day.timestamp === Math.floor(Date.now() / 86400000) ? data.aiUsage.day.count : 0) / AI_LIMITS.day) * 100)}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* GitHub Version Control Section */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
          <h3 className="text-sm font-bold text-sage-500 dark:text-neutral-400 uppercase tracking-widest mb-4">Sürüm Kontrolü</h3>
          
          <div className="space-y-4">
            {!repo && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
                <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">
                  GitHub deposu yapılandırılmamış. Güncellemeleri alabilmek için lütfen ortam değişkenlerine <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">VITE_GITHUB_REPO</code> ekleyin.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-sage-50 dark:bg-neutral-800 rounded-2xl border border-sage-100 dark:border-neutral-700">
              <div>
                <p className="font-bold text-sage-800 dark:text-white text-sm">Güncelleme Durumu</p>
                <p className="text-xs text-sage-600 dark:text-neutral-400 mt-1">
                  {checkStatus === 'checking' ? 'Kontrol ediliyor...' :
                   checkStatus === 'available' ? <span className="text-amber-600 font-bold">Yeni sürüm mevcut!</span> :
                   checkStatus === 'up-to-date' ? <span className="text-emerald-600 font-bold">Sürümünüz güncel</span> :
                   checkStatus === 'error' ? <span className="text-red-500">Kontrol başarısız</span> :
                   lastCheckTime ? `Son kontrol: ${lastCheckTime.toLocaleTimeString('tr-TR')}` : 'Henüz kontrol edilmedi'}
                </p>
              </div>
              <button 
                onClick={() => checkForUpdates(true)}
                disabled={isChecking || !repo}
                className="px-4 py-2 bg-sage-200 dark:bg-neutral-700 hover:bg-sage-300 dark:hover:bg-neutral-600 text-sage-800 dark:text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isChecking ? (
                  <div className="w-4 h-4 border-2 border-sage-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <RotateCcw size={14} />
                )}
                Kontrol Et
              </button>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="bg-white dark:bg-black rounded-3xl p-6 border border-sage-100 dark:border-white/10 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-sage-100 dark:bg-white/10 rounded-xl">
              <Info size={20} className="text-sage-600 dark:text-white" />
            </div>
            <h3 className="text-lg font-bold text-sage-800 dark:text-white">Hakkında</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-sage-50 dark:bg-white/5 rounded-2xl">
              <p className="text-sm text-sage-600 dark:text-white/80 leading-relaxed">
                Bu uygulama Yaşar Efe tarafından geliştirilmiştir. Modern bir Kur'an takip ve zikir uygulamasıdır.
              </p>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-sage-100 dark:border-neutral-800 overflow-hidden shadow-sm mt-4">
              <button 
                onClick={() => { playClick(); setActiveView('privacy');  }}
                className="w-full flex items-center justify-between p-4 hover:bg-sage-50 dark:hover:bg-neutral-800 transition-colors border-b border-sage-100 dark:border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <Shield className="text-sage-500 dark:text-neutral-400" size={20} />
                  <span className="font-medium text-sage-800 dark:text-white">Gizlilik Politikası</span>
                </div>
                <ChevronRight className="text-sage-400" size={20} />
              </button>
              <button 
                onClick={() => { playClick(); setActiveView('terms');  }}
                className="w-full flex items-center justify-between p-4 hover:bg-sage-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Book className="text-sage-500 dark:text-neutral-400" size={20} />
                  <span className="font-medium text-sage-800 dark:text-white">Kullanım Koşulları</span>
                </div>
                <ChevronRight className="text-sage-400" size={20} />
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-sage-100 dark:border-neutral-800 shadow-sm">
          <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-4">Tehlikeli Bölge</h3>
          <p className="text-sm text-sage-600 dark:text-white mb-6">
            Tüm verilerinizi (görevler, okuma geçmişi ve ayarlar) kalıcı olarak silmek için aşağıdaki butonu kullanın.
          </p>
          <button 
            onClick={() => { playClick(); setIsResetConfirmOpen(true); }}
            className="w-full py-4 text-red-600 font-bold bg-red-50 rounded-2xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mb-4"
          >
            <RotateCcw size={18} />
            Tüm Verileri Sıfırla
          </button>
          
          {user && (
            <button 
              onClick={() => { playClick(); setIsDeleteAccountConfirmOpen(true); }}
              className="w-full py-4 text-white font-bold bg-red-600 rounded-2xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Hesabı Sil
            </button>
          )}
        </section>
      </div>

      <div className="text-center">
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-sage-50 dark:bg-black">
      <Suspense fallback={null}>
        <LazyGoogleOneTap />
      </Suspense>
      <AnimatePresence mode="wait">
        {showSplash || authLoading ? (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ 
              opacity: 0,
              scale: 1.1,
              filter: "blur(10px)",
              transition: { duration: 0.8, ease: "easeInOut" }
            }}
            className="fixed inset-0 z-[100] bg-sage-800 dark:bg-black flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Background Decorative Elements */}
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 90, 180, 270, 360],
                opacity: [0.1, 0.2, 0.1]
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute w-[150%] h-[150%] border-[40px] border-white/5 rounded-full"
            />
            
            <div className="relative flex flex-col items-center justify-center">
              {/* Logo Glow */}
              <motion.div
                animate={{ 
                  scale: [1, 1.5, 1],
                  opacity: [0.2, 0.4, 0.2]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-sage-400 blur-3xl rounded-full"
              />
              
              {/* Logo */}
              <motion.img
                src="/favicon.svg"
                alt="HatimPro Logo"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "backOut" }}
                className="w-32 h-32 relative z-10 drop-shadow-2xl mb-6"
              />

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="text-center relative z-10"
              >
                <h1 className="text-4xl font-bold text-white tracking-widest uppercase">HatimPro</h1>
                <p className="text-white/80 mt-2 text-sm font-medium tracking-wider">Modern Kur'an Takipçisi</p>
              </motion.div>
            </div>

            <div className="mt-12 flex gap-2 justify-center relative z-10">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 1, 0.3] 
                  }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app-content"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="min-h-screen flex flex-col md:flex-row"
          >
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 border-r border-sage-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 h-screen sticky top-0 shrink-0 z-40">
              <div className="p-6 border-b border-sage-200 dark:border-neutral-800 flex items-center justify-between">
                <h1 className="display text-2xl font-bold text-sage-800 dark:text-white tracking-tight flex items-center gap-2">
                  <img src="/favicon.svg" alt="HatimPro Logo" className="w-8 h-8" referrerPolicy="no-referrer" />
                  HatimPro
                </h1>
              </div>
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                <button onClick={() => setActiveView('home')} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'home' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                  <Home size={20} strokeWidth={activeView === 'home' ? 2.5 : 2} />
                  Ana Sayfa
                </button>
                <button onClick={() => handleProtectedAction(() => setActiveView('tasks'))} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'tasks' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                  <ListTodo size={20} strokeWidth={activeView === 'tasks' ? 2.5 : 2} />
                  Görevler
                </button>
                <button onClick={() => setActiveView('zikir')} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'zikir' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                  <RotateCcw size={20} strokeWidth={activeView === 'zikir' ? 2.5 : 2} />
                  Zikir
                </button>
                <button onClick={() => handleProtectedAction(() => setActiveView('hatim-rooms'))} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'hatim-rooms' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                  <Book size={20} strokeWidth={activeView === 'hatim-rooms' ? 2.5 : 2} />
                  Hatim Odaları
                </button>
                <button onClick={() => { setProfileUsername(undefined); setActiveView('profile'); }} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'profile' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                  <User size={20} strokeWidth={activeView === 'profile' ? 2.5 : 2} />
                  Profil
                </button>
                
                <div className="pt-4 pb-2">
                  <div className="px-4 text-[10px] font-bold text-sage-400 uppercase tracking-wider mb-2">Keşfet & Ayarlar</div>
                  <button onClick={() => { playClick(); setActiveView('chat'); }} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'chat' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                    <Bot size={20} strokeWidth={activeView === 'chat' ? 2.5 : 2} />
                    Yapay Zeka Asistanı
                  </button>
                  <button onClick={() => { playClick(); setActiveView('leaderboard'); }} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'leaderboard' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                    <Trophy size={20} strokeWidth={activeView === 'leaderboard' ? 2.5 : 2} />
                    Liderlik Tablosu
                  </button>
                  <button onClick={() => { playClick(); setActiveView('stats'); }} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'stats' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                    <BarChart2 size={20} strokeWidth={activeView === 'stats' ? 2.5 : 2} />
                    İstatistikler
                  </button>
                  <button onClick={() => { playClick(); setActiveView('settings'); }} className={`sidebar-link w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'settings' ? 'bg-sage-100 dark:bg-neutral-800 text-sage-800 dark:text-white font-bold' : 'text-sage-600 dark:text-neutral-400 hover:bg-sage-50 dark:hover:bg-neutral-800/50'}`}>
                    <Settings size={20} strokeWidth={activeView === 'settings' ? 2.5 : 2} />
                    Ayarlar
                  </button>
                </div>
              </nav>
              <div className="p-4 border-t border-sage-200 dark:border-neutral-800">
                <div className="flex items-center gap-2 justify-center">
                  {!user && (
                    <button 
                      onClick={() => { setIsAuthModalOpen(true); }}
                      className="text-xs font-bold bg-black text-white px-3 py-2 rounded-xl hover:bg-neutral-800 transition-colors w-full"
                    >
                      Giriş Yap
                    </button>
                  )}
                  <button 
                    onClick={() => { setShowTutorial(true); }}
                    className="relative p-2 text-white bg-sage-500 hover:bg-sage-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-full transition-colors"
                  >
                    <HelpCircle size={20} />
                  </button>
                  <button 
                    onClick={() => { setIsNotificationsOpen(true); }}
                    className="relative p-2 text-white bg-sage-500 hover:bg-sage-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-full transition-colors"
                  >
                    <Bell size={20} />
                    {unreadNotifications > 0 && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900"></span>
                    )}
                  </button>
                  {user && (
                    <button 
                      onClick={handleLogout}
                      className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                      title="Çıkış Yap"
                    >
                      <LogOut size={20} />
                    </button>
                  )}
                </div>
              </div>
            </aside>

            <div className="main-content-area flex-1 flex flex-col min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative">
              <AnimatePresence>
                {showTutorial && (
                  <Suspense fallback={null}>
                    <LazyTutorialOverlay onClose={handleCloseTutorial} />
                  </Suspense>
                )}
              </AnimatePresence>

              {/* Header (Mobile Only) */}
              <header className="md:hidden bg-white dark:bg-neutral-900 border-b border-sage-200 dark:border-neutral-800 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sticky top-0 z-30">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                  <h1 className="display text-2xl font-bold text-sage-800 dark:text-white tracking-tight flex items-center gap-2">
                    <img src="/favicon.svg" alt="HatimPro Logo" className="w-8 h-8" referrerPolicy="no-referrer" />
                    HatimPro
                  </h1>
                  <div className="flex items-center gap-2">
                    {!user && (
                      <button 
                        onClick={() => { playClick(); setIsAuthModalOpen(true); }}
                        className="text-xs font-bold bg-black text-white px-3 py-2 rounded-xl hover:bg-neutral-800 transition-colors"
                      >
                        Giriş Yap
                      </button>
                    )}
                    <button 
                      onClick={() => { playClick(); setShowTutorial(true); }}
                      className="relative p-2 text-white bg-sage-500 hover:bg-sage-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-full transition-colors"
                    >
                      <HelpCircle size={24} />
                    </button>
                    <button 
                      onClick={() => { playClick(); setIsNotificationsOpen(true); }}
                      className="relative p-2 text-white bg-sage-500 hover:bg-sage-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-full transition-colors"
                    >
                      <Bell size={24} />
                      {unreadNotifications > 0 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900"></span>
                      )}
                    </button>
                    {user && (
                      <button 
                        onClick={handleLogout}
                        className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                      >
                        <LogOut size={24} />
                      </button>
                    )}
                  </div>
                </div>
              </header>

              <main className="max-w-2xl mx-auto px-6 pt-8 w-full">
                {activeView === 'home' && renderHome()}
                {activeView === 'tasks' && renderTasks()}
                {activeView === 'history' && renderHistory()}
                {activeView === 'settings' && renderSettings()}
                {activeView === 'profile' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyProfilePage 
                          username={profileUsername} 
                          onBack={() => {
                            setActiveView('home');
                          }} 
                          playClick={playClick} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'leaderboard' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyLeaderboardPage 
                          onBack={() => {
                            playClick();
                            setActiveView('home');
                          }} 
                          playClick={playClick} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'stats' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyStatsPage 
                          data={data}
                          onBack={() => {
                            playClick();
                            setActiveView('home');
                          }} 
                          playClick={playClick} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'zikir' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center">
                    <div className="w-full max-w-2xl h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyZikirPage 
                          onBack={() => {
                            setActiveView('home');
                            setZikirJoinSessionId(null);
                          }} 
                          playClick={playClick} 
                          joinSessionId={zikirJoinSessionId}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'hatim-rooms' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center">
                    <div className="w-full max-w-2xl h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyHatimRoomsPage 
                          onBack={() => {
                            setActiveView('home');
                            setHatimJoinSessionId(null);
                          }} 
                          playClick={playClick} 
                          joinSessionId={hatimJoinSessionId}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'privacy' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-sage-50 dark:bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-sage-200 dark:border-neutral-900 bg-sage-50 dark:bg-black">
                      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-sage-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyLegalPage 
                          type="privacy" 
                          onBack={() => {
                            setActiveView('settings');
                          }} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'terms' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-sage-50 dark:bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-sage-200 dark:border-neutral-900 bg-sage-50 dark:bg-black">
                      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-sage-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyLegalPage 
                          type="terms" 
                          onBack={() => {
                            setActiveView('settings');
                          }} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'data-deletion' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-sage-50 dark:bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-sage-200 dark:border-neutral-900 bg-sage-50 dark:bg-black">
                      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-sage-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyDataDeletionPage 
                          onBack={() => {
                            setActiveView('settings');
                          }} 
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
                {activeView === 'chat' && (
                  <div className="fixed inset-0 md:left-64 z-50 bg-black flex justify-center overflow-y-auto">
                    <div className="w-full max-w-2xl min-h-full relative border-x border-neutral-900 bg-black">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
                        <LazyChatPage 
                          onBack={() => {
                            playClick();
                            setActiveView('home');
                          }}
                          appData={data}
                          setData={setData}
                          profile={profile}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
              </main>

              {/* Bottom Navbar (Mobile Only) */}
              <nav className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-sage-200 dark:border-white/10 px-4 py-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] z-[60]">
                  <div className="max-w-md mx-auto flex justify-between items-center">
                    <button 
                      onClick={() => { playClick(); setActiveView('home'); }}
                      className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'home' ? 'text-sage-800 dark:text-white' : 'text-sage-400 dark:text-neutral-400'}`}
                    >
                      <Home size={22} strokeWidth={activeView === 'home' ? 2.5 : 2} />
                      <span className="text-[10px] font-medium hidden sm:block">Ana Sayfa</span>
                    </button>
                    <button 
                      onClick={() => handleProtectedAction(() => { playClick(); setActiveView('tasks'); })}
                      className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'tasks' ? 'text-sage-800 dark:text-white' : 'text-sage-400 dark:text-neutral-500'}`}
                    >
                      <ListTodo size={22} strokeWidth={activeView === 'tasks' ? 2.5 : 2} />
                      <span className="text-[10px] font-medium hidden sm:block">Görevler</span>
                    </button>
                    <button 
                      onClick={() => { playClick(); setActiveView('zikir'); }}
                      className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'zikir' ? 'text-sage-800 dark:text-white' : 'text-sage-400 dark:text-neutral-500'}`}
                    >
                      <RotateCcw size={22} strokeWidth={activeView === 'zikir' ? 2.5 : 2} />
                      <span className="text-[10px] font-medium hidden sm:block">Zikir</span>
                    </button>
                    <button 
                      onClick={() => handleProtectedAction(() => { playClick(); setActiveView('hatim-rooms'); })}
                      className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'hatim-rooms' ? 'text-sage-800 dark:text-white' : 'text-sage-400 dark:text-neutral-500'}`}
                    >
                      <Book size={22} strokeWidth={activeView === 'hatim-rooms' ? 2.5 : 2} />
                      <span className="text-[10px] font-medium hidden sm:block">Hatim</span>
                    </button>
                    <button 
                      onClick={() => { 
                        playClick(); 
                        setProfileUsername(undefined);
                        setActiveView('profile'); 
                      }}
                      className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'profile' ? 'text-sage-800 dark:text-white' : 'text-sage-400 dark:text-neutral-500'}`}
                    >
                      <User size={22} strokeWidth={activeView === 'profile' ? 2.5 : 2} />
                      <span className="text-[10px] font-medium hidden sm:block">Profil</span>
                    </button>
                    <Drawer.Root open={isMoreDrawerOpen} onOpenChange={setIsMoreDrawerOpen}>
                      <Drawer.Trigger asChild>
                        <button 
                          onClick={() => playClick()}
                          className="flex flex-col items-center gap-1 transition-colors text-sage-400 dark:text-neutral-500"
                        >
                          <MoreHorizontal size={22} strokeWidth={2} />
                          <span className="text-[10px] font-medium hidden sm:block">Diğer</span>
                        </button>
                      </Drawer.Trigger>
                      <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
                        <Drawer.Content className="bg-white dark:bg-neutral-900 flex flex-col rounded-t-[32px] h-[60vh] mt-24 fixed bottom-0 left-0 right-0 z-[70] outline-none">
                          <div className="p-4 bg-white dark:bg-neutral-900 rounded-t-[32px] flex-1 overflow-y-auto">
                            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-sage-200 dark:bg-neutral-800 mb-8" />
                            <div className="max-w-md mx-auto space-y-2">
                              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-4 px-4">Diğer Seçenekler</h3>
                              <button onClick={() => { playClick(); setActiveView('chat'); setIsMoreDrawerOpen(false); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-sage-50 dark:hover:bg-neutral-800 rounded-2xl transition-colors">
                                <div className="bg-teal-100 dark:bg-teal-900/30 p-2 rounded-xl text-teal-600 dark:text-teal-400">
                                  <Bot size={20} />
                                </div>
                                <span className="font-bold text-sage-800 dark:text-white">Yapay Zeka Asistanı</span>
                              </button>
                              <button onClick={() => { playClick(); setActiveView('leaderboard'); setIsMoreDrawerOpen(false); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-sage-50 dark:hover:bg-neutral-800 rounded-2xl transition-colors">
                                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl text-amber-600 dark:text-amber-400">
                                  <Trophy size={20} />
                                </div>
                                <span className="font-bold text-sage-800 dark:text-white">Liderlik Tablosu</span>
                              </button>
                              <button onClick={() => { playClick(); setActiveView('stats'); setIsMoreDrawerOpen(false); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-sage-50 dark:hover:bg-neutral-800 rounded-2xl transition-colors">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl text-blue-600 dark:text-blue-400">
                                  <BarChart2 size={20} />
                                </div>
                                <span className="font-bold text-sage-800 dark:text-white">İstatistikler</span>
                              </button>
                              <button onClick={() => { playClick(); setActiveView('settings'); setIsMoreDrawerOpen(false); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-sage-50 dark:hover:bg-neutral-800 rounded-2xl transition-colors">
                                <div className="bg-sage-100 dark:bg-neutral-800 p-2 rounded-xl text-sage-600 dark:text-white">
                                  <Settings size={20} />
                                </div>
                                <span className="font-bold text-sage-800 dark:text-white">Ayarlar</span>
                              </button>

                              {/* AI Rate Limits */}
                              <div className="mt-6 px-4">
                                <h4 className="text-sm font-bold text-sage-600 dark:text-neutral-400 mb-3 flex items-center gap-2">
                                  <Bot size={16} />
                                  Yapay Zeka Kullanım Limitleri
                                </h4>
                                <div className="bg-sage-50 dark:bg-neutral-800/50 rounded-2xl p-4 space-y-3">
                                  {(() => {
                                    const now = new Date();
                                    const currentMinute = Math.floor(now.getTime() / 60000);
                                    const currentHour = Math.floor(now.getTime() / 3600000);
                                    const currentDay = Math.floor(now.getTime() / 86400000);
                                    
                                    const usage = data.aiUsage || {
                                      minute: { count: 0, timestamp: 0 },
                                      hour: { count: 0, timestamp: 0 },
                                      day: { count: 0, timestamp: 0 }
                                    };

                                    const minCount = usage.minute.timestamp === currentMinute ? usage.minute.count : 0;
                                    const hourCount = usage.hour.timestamp === currentHour ? usage.hour.count : 0;
                                    const dayCount = usage.day.timestamp === currentDay ? usage.day.count : 0;

                                    return (
                                      <>
                                        <div className="flex justify-between items-center text-sm">
                                          <span className="text-sage-600 dark:text-neutral-400">Dakikalık</span>
                                          <span className="font-medium text-sage-800 dark:text-white">{minCount} / 5</span>
                                        </div>
                                        <div className="w-full bg-sage-200 dark:bg-neutral-700 rounded-full h-1.5">
                                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (minCount / 5) * 100)}%` }}></div>
                                        </div>

                                        <div className="flex justify-between items-center text-sm pt-1">
                                          <span className="text-sage-600 dark:text-neutral-400">Saatlik</span>
                                          <span className="font-medium text-sage-800 dark:text-white">{hourCount} / 20</span>
                                        </div>
                                        <div className="w-full bg-sage-200 dark:bg-neutral-700 rounded-full h-1.5">
                                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (hourCount / 20) * 100)}%` }}></div>
                                        </div>

                                        <div className="flex justify-between items-center text-sm pt-1">
                                          <span className="text-sage-600 dark:text-neutral-400">Günlük</span>
                                          <span className="font-medium text-sage-800 dark:text-white">{dayCount} / 100</span>
                                        </div>
                                        <div className="w-full bg-sage-200 dark:bg-neutral-700 rounded-full h-1.5">
                                          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (dayCount / 100) * 100)}%` }}></div>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Drawer.Content>
                      </Drawer.Portal>
                    </Drawer.Root>
                  </div>
                </nav>
              </div>
            </motion.div>
        )}
      </AnimatePresence>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Spiritual Commitment Modal */}
      <AnimatePresence>
        {showCommitmentModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 border border-sage-100 dark:border-neutral-800 w-full max-w-sm rounded-3xl p-8 relative z-10 text-center"
            >
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield size={40} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              
              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-2">Manevi Taahhüt</h3>
              <p className="text-sage-500 dark:text-neutral-400 text-sm mb-8 leading-relaxed">
                Okuduğunuz sayfaları kaydetmek üzeresiniz. Bu sayfaların tamamını, harflerin hakkını vererek okuduğunuzu beyan ediyor musunuz?
              </p>

              <div className="space-y-4 mb-8">
                <div className="text-left">
                  <label className="block text-xs font-bold text-sage-500 dark:text-neutral-400 uppercase mb-2">Kaç Sayfa Okudunuz?</label>
                  <input 
                    type="number" 
                    value={newPageInput}
                    onChange={(e) => {
                      setNewPageInput(e.target.value);
                      setCommitmentError(null);
                    }}
                    placeholder="Örn: 5"
                    className="w-full bg-sage-50 dark:bg-neutral-800 border border-sage-200 dark:border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:text-white"
                  />
                  {commitmentError && (
                    <p className="text-red-500 text-xs mt-2 font-medium">{commitmentError}</p>
                  )}
                </div>
                <div className="flex items-center justify-between bg-sage-50 dark:bg-neutral-800 p-4 rounded-xl">
                  <span className="text-sm text-sage-600 dark:text-neutral-400">Okuma Süresi:</span>
                  <span className="font-mono font-bold text-sage-800 dark:text-white">{formatTime(readingTime)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmReading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/20"
                >
                  Evet, Okudum
                </button>
                <button 
                  onClick={cancelReading}
                  className="w-full py-3 text-sage-400 hover:text-red-500 font-medium transition-colors"
                >
                  İptal Et
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Log Modal */}
      <AnimatePresence>
        {isAddLogOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddLogOpen(false)}
              className="absolute inset-0 bg-sage-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-t-3xl md:rounded-3xl p-8 relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-sage-800">İlerleme Kaydet</h3>
                <button onClick={() => { playClick(); setIsAddLogOpen(false); }} className="text-sage-400 hover:text-sage-600">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleAddLog} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-sage-500 mb-2 uppercase tracking-wider">Okuma Tarihi</label>
                    <input 
                      type="date" 
                      value={newLogDate}
                      max={(() => {
                        const d = new Date();
                        return d.toISOString().split('T')[0];
                      })()}
                      onChange={(e) => setNewLogDate(e.target.value)}
                      className="w-full bg-sage-50 border-2 border-sage-100 rounded-2xl px-6 py-3 font-bold text-sage-800 focus:border-sage-500 focus:outline-none transition-all"
                    />
                    <p className="text-[10px] text-sage-400 mt-1">Geçmiş günler veya bugün için kayıt yapabilirsiniz.</p>
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">⚠️</span>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      <strong>Güven Puanı Uyarısı:</strong> Zamanlayıcı kullanmadan yapılan manuel kayıtlar, sistem tarafından doğrulanamadığı için <strong>Güven Puanınızı (Trust Score) 2 puan düşürür</strong>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-sage-500 mb-2 uppercase tracking-wider">
                      Kaç sayfa okudunuz?
                    </label>
                    <input 
                      type="number" 
                      value={newPageInput}
                      onChange={(e) => setNewPageInput(e.target.value)}
                      placeholder="Örn: 5"
                      autoFocus
                      min={1}
                      className="w-full bg-sage-50 border-2 border-sage-100 rounded-2xl px-6 py-4 text-xl font-bold text-sage-800 focus:border-sage-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>
                
                <LiquidGlassButton 
                  type="submit"
                  className="w-full py-4 text-white font-bold text-lg"
                  intensity="heavy"
                >
                  Kaydet
                </LiquidGlassButton>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Task Modal */}
      <AnimatePresence>
        {isAddTaskOpen && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddTaskOpen(false)}
              className="absolute inset-0 bg-sage-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-3xl p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-sage-800">Yeni Görev</h3>
                <button onClick={() => { playClick(); setIsAddTaskOpen(false); }} className="text-sage-400 hover:text-sage-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-8">
                {/* Juz Picker */}
                <div className="bg-sage-50 p-4 rounded-2xl border border-sage-100">
                  <button 
                    onClick={() => setIsJuzPickerOpen(!isJuzPickerOpen)}
                    className="w-full flex items-center justify-between font-bold text-sage-800"
                  >
                    <div className="flex items-center gap-2">
                      <LayoutGrid size={18} className="text-sage-600" />
                      <span>Cüz Aralığı Seç</span>
                    </div>
                    <ChevronRight size={18} className={isJuzPickerOpen ? 'rotate-90' : ''} />
                  </button>
                  
                  <AnimatePresence>
                    {isJuzPickerOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 mb-4 p-3 bg-white dark:bg-sage-200 rounded-xl border border-sage-200 dark:border-sage-300 text-xs text-sage-600 dark:text-sage-800 flex items-center gap-2">
                          <Info size={14} className="shrink-0" />
                          <p>
                            {startJuzSelection === null 
                              ? "Başlangıç cüzünü seçin." 
                              : `${startJuzSelection}. Cüz seçildi. Bitiş cüzünü seçin.`}
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {Array.from({ length: 30 }).map((_, i) => {
                            const juzNum = i + 1;
                            const isSelected = startJuzSelection === juzNum;
                            return (
                              <button
                                key={i}
                                onClick={() => handleJuzClick(juzNum)}
                                className={`rounded-lg py-2 text-sm font-bold transition-all ${
                                  isSelected 
                                    ? "bg-sage-700 text-white scale-110 shadow-md" 
                                    : "bg-white dark:bg-sage-200 border border-sage-200 dark:border-sage-300 text-sage-700 dark:text-sage-800 hover:bg-sage-50 dark:hover:bg-sage-300"
                                }`}
                              >
                                {juzNum}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <form onSubmit={handleCustomTaskSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-sage-500 mb-2 uppercase tracking-wider">Görev Adı</label>
                      <input 
                        type="text" 
                        value={customTaskName}
                        onChange={(e) => setCustomTaskName(e.target.value)}
                        maxLength={40}
                        placeholder="Örn: Ramazan Mukabelesi"
                        className="w-full bg-sage-50 border-2 border-sage-100 rounded-2xl px-4 py-3 font-bold text-sage-800 focus:border-sage-500 focus:outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-sage-500 mb-2 uppercase tracking-wider">Başlangıç Sayfası</label>
                        <input 
                          type="number" 
                          value={customStartPage}
                          onChange={(e) => setCustomStartPage(e.target.value)}
                          className="w-full bg-sage-50 border-2 border-sage-100 rounded-2xl px-4 py-3 font-bold text-sage-800 focus:border-sage-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-sage-500 mb-2 uppercase tracking-wider">Bitiş Sayfası</label>
                        <input 
                          type="number" 
                          value={customEndPage}
                          onChange={(e) => setCustomEndPage(e.target.value)}
                          className="w-full bg-sage-50 border-2 border-sage-100 rounded-2xl px-4 py-3 font-bold text-sage-800 focus:border-sage-500 focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <LiquidGlassButton 
                    type="submit"
                    className="w-full py-4 text-white font-bold"
                    intensity="heavy"
                  >
                    Özel Görev Oluştur
                  </LiquidGlassButton>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Task Delete Confirmation Modal */}
      <AnimatePresence>
        {taskToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClick(); setTaskToDelete(null); }}
              className="absolute inset-0 bg-sage-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl text-center max-h-[90vh] overflow-y-auto"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-2">Görevi Sil?</h3>
              <p className="text-sage-500 dark:text-sage-400 text-sm mb-8">
                Bu görevi ve tüm kayıtlarını silmek istediğinize emin misiniz?
              </p>
              <div className="space-y-3">
                <button 
                  onClick={confirmDeleteTask}
                  className="w-full bg-red-600 text-white rounded-2xl py-4 font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95"
                >
                  Evet, Sil
                </button>
                <button 
                  onClick={() => { playClick(); setTaskToDelete(null); }}
                  className="w-full bg-sage-50 text-sage-600 rounded-2xl py-4 font-bold hover:bg-sage-100 transition-all"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Alert Modal */}
      <AnimatePresence>
        {errorMessage && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClick(); setErrorMessage(null); }}
              className="absolute inset-0 bg-sage-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl text-center max-h-[90vh] overflow-y-auto"
            >
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Info size={32} />
              </div>
              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-2">Bilgi</h3>
              <p className="text-sage-500 dark:text-sage-400 text-sm mb-8">
                {errorMessage}
              </p>
              <button 
                onClick={() => { playClick(); setErrorMessage(null); }}
                className="w-full bg-sage-600 text-white rounded-2xl py-4 font-bold hover:bg-sage-700 transition-all"
              >
                Tamam
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirm Modal */}
      <AnimatePresence>
        {isDeleteAccountConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClick(); setIsDeleteAccountConfirmOpen(false); }}
              className="absolute inset-0 bg-sage-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-black w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl text-center border border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-2">Hesabı Sil?</h3>
              <p className="text-sage-500 dark:text-white/80 text-sm mb-8">
                Hesabınızı ve buluttaki tüm verilerinizi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="space-y-3">
                <button 
                  onClick={handleDeleteAccount}
                  className="w-full bg-red-600 text-white rounded-2xl py-4 font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95"
                >
                  Evet, Hesabı Sil
                </button>
                <button 
                  onClick={() => { playClick(); setIsDeleteAccountConfirmOpen(false); }}
                  className="w-full bg-sage-50 dark:bg-white/10 text-sage-600 dark:text-white rounded-2xl py-4 font-bold hover:bg-sage-100 dark:hover:bg-white/20 transition-all"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClick(); setIsResetConfirmOpen(false); }}
              className="absolute inset-0 bg-sage-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-black w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl text-center border border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-xl font-bold text-sage-800 dark:text-white mb-2">Verileri Sıfırla?</h3>
              <p className="text-sage-500 dark:text-white/80 text-sm mb-8">
                Tüm görevleriniz ve okuma geçmişiniz kalıcı olarak silinecektir. Bu işlem geri alınamaz.
              </p>
              <div className="space-y-3">
                <button 
                  onClick={resetData}
                  className="w-full bg-red-600 text-white rounded-2xl py-4 font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95"
                >
                  Evet, Her Şeyi Sil
                </button>
                <button 
                  onClick={() => { playClick(); setIsResetConfirmOpen(false); }}
                  className="w-full bg-sage-50 dark:bg-white/10 text-sage-600 dark:text-white rounded-2xl py-4 font-bold hover:bg-sage-100 dark:hover:bg-white/20 transition-all"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isQuranReaderOpen && (
          <Suspense fallback={<div className="fixed inset-0 z-[70] bg-sage-50 dark:bg-black flex items-center justify-center"><div className="w-8 h-8 border-4 border-sage-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <LazyQuranReader 
              onClose={() => setIsQuranReaderOpen(false)} 
              playClick={playClick}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Create Password Modal */}
      <AnimatePresence>
        {showCreatePasswordModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-sage-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="w-16 h-16 bg-sage-50 text-sage-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Key size={32} />
              </div>
              <h3 className="text-xl font-bold text-sage-800 mb-2 text-center">Şifre Oluşturun</h3>
              <p className="text-sage-500 text-sm mb-6 text-center">
                Hesabınızın güvenliği için lütfen bir şifre belirleyin. Bu şifreyi daha sonra giriş yapmak için kullanabilirsiniz.
              </p>
              
              <form onSubmit={handleCreatePassword} className="space-y-4">
                {createPasswordError && <p className="text-xs text-red-600 text-center">{createPasswordError}</p>}
                
                <div>
                  <label className="block text-xs font-bold text-sage-600 mb-1">Şifre</label>
                  <input
                    type="password"
                    value={createPasswordInput}
                    onChange={(e) => setCreatePasswordInput(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 bg-sage-50 border border-sage-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-sage-600 mb-1">Şifre (Tekrar)</label>
                  <input
                    type="password"
                    value={createPasswordConfirm}
                    onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 bg-sage-50 border border-sage-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sage-500 text-sm"
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-sage-600 text-white rounded-2xl py-4 font-bold shadow-lg hover:bg-sage-700 transition-all active:scale-95 mt-2"
                >
                  Şifre Oluştur
                </button>
                <button 
                  type="button"
                  onClick={() => setShowCreatePasswordModal(false)}
                  className="w-full text-sage-400 text-xs font-bold hover:text-sage-600 transition-colors py-2"
                >
                  Daha Sonra
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update Available Modal */}
      <AnimatePresence>
        {updateAvailable && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-sage-900/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-3xl p-8 relative z-10 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <RotateCcw className="text-emerald-600 dark:text-emerald-400" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-sage-800 dark:text-white mb-2">Yeni Güncelleme!</h3>
              <p className="text-sage-600 dark:text-neutral-400 mb-8">
                Uygulamanın yeni bir sürümü yayınlandı. Yenilikleri görmek ve daha iyi bir deneyim yaşamak için lütfen sayfayı yenileyin.
              </p>
              
              <button 
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Yükleniyor...
                  </>
                ) : (
                  'Şimdi Yenile'
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <LazyNotificationsPanel 
          isOpen={isNotificationsOpen} 
          onClose={() => setIsNotificationsOpen(false)} 
          onJoinSession={(sessionId) => {
            setZikirJoinSessionId(sessionId);
            setActiveView('zikir');
          }}
          playClick={playClick}
        />
      </Suspense>
    </div>
  );
}
