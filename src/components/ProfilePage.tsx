import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, 
  Settings, 
  Search, 
  UserPlus, 
  UserMinus, 
  ChevronLeft, 
  Camera, 
  Check, 
  X,
  TrendingUp,
  Star,
  Clock,
  BookOpen,
  RotateCcw,
  Flame,
  Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  onSnapshot
} from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface ProfilePageProps {
  username?: string;
  onBack: () => void;
  playClick: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ username, onBack, playClick }) => {
  const { user, profile: currentUserProfile } = useAuth();
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(username);
  
  useEffect(() => {
    setCurrentUsername(username);
  }, [username]);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Edit states
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Mouse drag to scroll logic
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
    scrollRef.current.style.scrollSnapType = 'none'; // Disable snap while dragging
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.scrollSnapType = 'x mandatory';
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.scrollSnapType = 'x mandatory';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 2; // Scroll-fast
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const currentScrollLeft = scrollRef.current.scrollLeft;
      const width = scrollRef.current.offsetWidth;
      const index = Math.round(currentScrollLeft / width);
      setActiveSlide(index);
    }
  };

  // Auto-scroll logic
  useEffect(() => {
    const interval = setInterval(() => {
      if (!scrollRef.current || isDragging.current) return;
      
      const width = scrollRef.current.offsetWidth;
      const totalSlides = 3;
      const nextSlide = (activeSlide + 1) % totalSlides;
      
      scrollRef.current.scrollTo({
        left: nextSlide * width,
        behavior: 'smooth'
      });
    }, 5000); // Her 5 saniyede bir kaydır

    return () => clearInterval(interval);
  }, [activeSlide]);

  // Calculate chart data
  const chartData = React.useMemo(() => {
    if (!profile?.data?.logs) return [];
    
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const pages = profile.data.logs
        .filter((log: any) => log.date.startsWith(date))
        .reduce((sum: number, log: any) => sum + log.pagesRead, 0);
      
      return {
        date: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short' }),
        pages
      };
    });
  }, [profile]);

  const userLevel = React.useMemo(() => {
    if (profile?.stats?.level) return profile.stats.level;
    if (profile?.stats?.xp) return Math.floor(Math.sqrt(profile.stats.xp / 50)) + 1;
    return 1;
  }, [profile]);

  const currentLevelXP = Math.pow(userLevel - 1, 2) * 50;
  const nextLevelXP = Math.pow(userLevel, 2) * 50;
  const xpProgress = Math.min(100, Math.max(0, ((profile?.stats?.xp || 0) - currentLevelXP) / (nextLevelXP - currentLevelXP) * 100));

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      let currentProfileData = null;
      if (currentUsername) {
        // Fetch by username
        const q = query(collection(db, 'users'), where('username', '==', currentUsername), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          currentProfileData = { ...snap.docs[0].data(), uid: snap.docs[0].id };
          setProfile(currentProfileData);
        } else {
          setProfile(null);
        }
      } else if (user) {
        // Fetch current user
        currentProfileData = currentUserProfile;
        setProfile(currentUserProfile);
        setEditName(currentUserProfile?.displayName || '');
        setEditUsername(currentUserProfile?.username || '');
        setEditBio(currentUserProfile?.bio || '');
        setEditPhoto(currentUserProfile?.photoURL || '');
      }
      
      if (currentProfileData?.uid) {
        // Fetch followers count
        const followersQuery = query(collection(db, 'users'), where('following', 'array-contains', currentProfileData.uid));
        const followersSnap = await getDocs(followersQuery);
        setFollowersCount(followersSnap.size);
      }
      
      setLoading(false);
    };

    fetchProfile();
  }, [currentUsername, user, currentUserProfile]);

  const handleFollow = async () => {
    if (!user || !profile || !profile.uid || !currentUserProfile) return;
    playClick();
    
    const isFollowing = currentUserProfile.following?.includes(profile.uid);
    const currentUserRef = doc(db, 'users', user.uid);

    try {
      if (isFollowing) {
        await updateDoc(currentUserRef, { following: arrayRemove(profile.uid) });
      } else {
        await updateDoc(currentUserRef, { following: arrayUnion(profile.uid) });
        
        // Send notification
        try {
          const notificationId = `follow_${user.uid}_${profile.uid}`;
          await setDoc(doc(db, 'notifications', notificationId), {
            userId: profile.uid,
            type: 'new_follower',
            senderId: user.uid,
            senderName: currentUserProfile.displayName || 'Bir kullanıcı',
            createdAt: new Date().toISOString(),
            read: false
          });

          // Send push notification if target user has a subscription
          if (profile.pushSubscription) {
            await fetch('/api/notifications/send', {
              method: 'POST',
              body: JSON.stringify({
                title: 'Yeni Takipçi',
                body: `${currentUserProfile.displayName || 'Bir kullanıcı'} seni takip etmeye başladı!`,
                url: `/profile/${currentUserProfile.username || user.uid}`,
                subscription: profile.pushSubscription
              }),
              headers: { 'content-type': 'application/json' }
            });
          }
        } catch (err) {
          console.error("Error sending follow notification:", err);
        }
      }
    } catch (e) {
      console.error("Follow error", e);
    }
  };

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      
      const searchStr = searchQuery.trim().toLowerCase();
      const q = query(
        collection(db, 'users'), 
        where('username', '>=', searchStr),
        where('username', '<=', searchStr + '\uf8ff'),
        limit(10)
      );
      
      const snap = await getDocs(q);
      setSearchResults(snap.docs.map(doc => doc.data()));
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    const file = e.target.files[0];
    
    if (file.size > 2 * 1024 * 1024) {
      setError('Lütfen 2MB\'dan küçük bir fotoğraf seçin.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const base64String = canvas.toDataURL('image/jpeg', 0.7);
        setEditPhoto(base64String);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    playClick();
    setError(null);
    setSuccessMsg(null);

    let newUsernameHistory = currentUserProfile?.usernameChangeHistory || [];
    const now = Date.now();
    const fourDaysAgo = now - (4 * 24 * 60 * 60 * 1000);

    // Check username uniqueness if changed
    if (editUsername !== currentUserProfile?.username) {
      // Rate limit check
      // Filter history to keep only changes within last 4 days
      newUsernameHistory = newUsernameHistory.filter(timestamp => timestamp > fourDaysAgo);
      
      if (newUsernameHistory.length >= 2) {
        setError("Kullanıcı adı 4 günde en fazla 2 kez değiştirilebilir.");
        return;
      }

      const q = query(collection(db, 'users'), where('username', '==', editUsername.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError("Bu kullanıcı adı zaten alınmış.");
        return;
      }
      
      // Add current change to history
      newUsernameHistory.push(now);
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: editName,
        username: editUsername.toLowerCase(),
        bio: editBio,
        photoURL: editPhoto,
        usernameChangeHistory: newUsernameHistory
      });
      setIsEditing(false);
    } catch (e) {
      console.error("Profile update error:", e);
      setError("Profil güncellenirken bir hata oluştu.");
    }
  };

  const formatReadingTime = (seconds: number = 0) => {
    if (seconds === 0) return '0 dk';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} sa ${minutes} dk`;
    }
    return `${minutes} dk`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile && username) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Kullanıcı Bulunamadı</h2>
        <p className="text-white/60 mb-8">Aradığınız kullanıcı mevcut değil veya silinmiş olabilir.</p>
        <button onClick={onBack} className="bg-white text-black px-8 py-3 rounded-2xl font-bold">Geri Dön</button>
      </div>
    );
  }

  const isOwnProfile = user?.uid === profile?.uid;
  const isFollowing = currentUserProfile?.following?.includes(profile?.uid);

  return (
    <div className="min-h-screen bg-black text-white pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-lg font-bold tracking-tight">
            {profile?.username ? `@${profile.username}` : 'Profil'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSearching(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <Search size={22} />
          </button>
          {isOwnProfile && (
            <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Settings size={22} />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-8">
        {/* Profile Info */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full border-2 border-white/20 p-1">
              <img 
                src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid}`} 
                alt={profile?.displayName}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-1">{profile?.displayName}</h1>
          <p className="text-white/60 text-sm mb-4">@{profile?.username || 'kullaniciadi'}</p>
          {profile?.bio && <p className="text-sm text-white/80 max-w-sm mb-6">{profile.bio}</p>}
          
          {/* Stats Carousel */}
          <div className="w-full mb-8 -mx-6 px-6">
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] cursor-grab active:cursor-grabbing"
            >
              {/* Card 1: Level & XP */}
              <div className="w-[85%] shrink-0 snap-center bg-gradient-to-br from-blue-900/40 to-purple-900/40 rounded-3xl p-6 border border-white/10 flex flex-col justify-between aspect-[3/2]">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-white/60 text-sm font-bold uppercase tracking-wider mb-1">Seviye</p>
                    <h3 className="text-4xl font-black text-white">{userLevel}</h3>
                  </div>
                  <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-400">
                    <TrendingUp size={24} />
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="flex justify-between text-sm mb-2 font-bold">
                    <span className="text-white/80">{profile?.stats?.xp || 0} XP</span>
                    <span className="text-white/40">{nextLevelXP} XP</span>
                  </div>
                  <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${xpProgress}%` }} />
                  </div>
                </div>
              </div>

              {/* Card 2: Streak & Trust */}
              <div className="w-[85%] shrink-0 snap-center bg-gradient-to-br from-orange-900/40 to-red-900/40 rounded-3xl p-6 border border-white/10 flex flex-col justify-between aspect-[3/2]">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-white/60 text-sm font-bold uppercase tracking-wider mb-1">Okuma Serisi</p>
                    <h3 className="text-4xl font-black text-white">{profile?.stats?.streak || 0} <span className="text-xl text-white/60 font-medium">Gün</span></h3>
                  </div>
                  <div className="bg-orange-500/20 p-3 rounded-2xl text-orange-400">
                    <Flame size={24} />
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-black/30 p-3 rounded-2xl mt-auto">
                  <Shield size={20} className="text-emerald-500 shrink-0" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-white/80">Güven Puanı</span>
                      <span className="text-emerald-500">%{profile?.stats?.trustScore ?? 100}</span>
                    </div>
                    <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${profile?.stats?.trustScore ?? 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Reading & Zikir */}
              <div className="w-[85%] shrink-0 snap-center bg-gradient-to-br from-emerald-900/40 to-teal-900/40 rounded-3xl p-6 border border-white/10 flex flex-col justify-between aspect-[3/2]">
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="flex flex-col justify-center">
                    <BookOpen size={20} className="text-emerald-400 mb-2" />
                    <p className="text-2xl font-bold text-white mb-1">{profile?.stats?.totalReadPages || 0}</p>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Sayfa</p>
                  </div>
                  <div className="flex flex-col justify-center">
                    <RotateCcw size={20} className="text-teal-400 mb-2" />
                    <p className="text-2xl font-bold text-white mb-1">{profile?.stats?.totalZikir || 0}</p>
                    <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Zikir</p>
                  </div>
                  <div className="col-span-2 bg-black/30 p-3 rounded-2xl flex items-center gap-3 mt-auto">
                    <Clock size={16} className="text-white/60 shrink-0" />
                    <span className="text-sm font-bold text-white/80 truncate">{formatReadingTime(profile?.stats?.totalReadingTime)} Toplam Süre</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Pagination Dots */}
            <div className="flex justify-center gap-2 mt-2">
              {[0, 1, 2].map(idx => (
                <div 
                  key={idx} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${activeSlide === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-8 mb-8">
            <div className="text-center">
              <p className="text-lg font-bold">{profile?.following?.length || 0}</p>
              <p className="text-xs text-white/40 uppercase tracking-widest">Takip</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{followersCount}</p>
              <p className="text-xs text-white/40 uppercase tracking-widest">Takipçi</p>
            </div>
          </div>

          {!isOwnProfile && user && (
            <button 
              onClick={handleFollow}
              className={`w-full max-w-xs py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                isFollowing 
                  ? "bg-white/10 text-white border border-white/20" 
                  : "bg-white text-black"
              }`}
            >
              {isFollowing ? (
                <>
                  <UserMinus size={18} />
                  Takibi Bırak
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Takip Et
                </>
              )}
            </button>
          )}
        </div>

        {/* Reading Chart */}
        <div className="bg-white/5 rounded-3xl p-6 border border-white/10 mb-8">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-sage-600" />
            Son 7 Gün Okuma
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#666', fontSize: 12 }} 
                  dy={10}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '12px',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#888', marginBottom: '4px' }}
                />
                <Bar dataKey="pages" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pages > 0 ? '#4ade80' : '#333'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black border border-white/10 w-full max-w-md rounded-3xl p-8 relative z-10 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Profili Düzenle</h3>
                <button onClick={() => { setIsEditing(false); setError(null); setSuccessMsg(null); }} className="p-2 hover:bg-white/10 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="relative">
                    <img 
                      src={editPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
                      className="w-20 h-20 rounded-full object-cover border-2 border-white/20"
                    />
                    <label className="absolute bottom-0 right-0 p-2 bg-white text-black rounded-full shadow-lg cursor-pointer hover:bg-gray-200 transition-colors">
                      <Camera size={14} />
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2">Profil Fotoğrafı URL</label>
                  <input 
                    type="text" 
                    value={editPhoto}
                    onChange={(e) => setEditPhoto(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:border-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2">Görünen İsim</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={30}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:border-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2">Kullanıcı Adı</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                    <input 
                      type="text" 
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      maxLength={20}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-8 pr-4 py-3 focus:border-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2">Hakkımda</label>
                  <textarea 
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    maxLength={150}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:border-white focus:outline-none transition-all resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                    <Shield size={16} className="text-emerald-500" />
                    Güvenlik
                  </h4>
                  <p className="text-xs text-white/40 mt-2 text-center">
                    Güvenlik ayarlarınızı ana menüdeki Ayarlar sayfasından yönetebilirsiniz.
                  </p>
                </div>

                {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}
                {successMsg && <p className="text-emerald-500 text-sm font-bold text-center">{successMsg}</p>}

                <button 
                  onClick={handleSaveProfile}
                  className="w-full bg-white text-black py-4 rounded-2xl font-bold hover:bg-white/90 transition-all mt-4"
                >
                  Kaydet
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearching && (
          <div className="fixed inset-0 z-[100] bg-black">
            <div className="p-6 border-b border-white/10 flex items-center gap-4">
              <button onClick={() => setIsSearching(false)} className="p-2 -ml-2">
                <ChevronLeft size={24} />
              </button>
              <form onSubmit={handleSearch} className="flex-1 relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Kullanıcı ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 focus:border-white focus:outline-none transition-all"
                />
              </form>
            </div>
            
            <div className="p-6 space-y-4">
              {searchResults.map((res: any) => (
                <button 
                  key={res.uid}
                  onClick={() => {
                    setCurrentUsername(res.username);
                    window.history.pushState({}, '', '/@' + res.username);
                    setIsSearching(false);
                    setSearchResults([]);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all"
                >
                  <img 
                    src={res.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${res.uid}`} 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div className="text-left">
                    <p className="font-bold">{res.displayName}</p>
                    <p className="text-xs text-white/40">@{res.username}</p>
                  </div>
                </button>
              ))}
              {searchQuery && searchResults.length === 0 && (
                <p className="text-center text-white/40 mt-12">Sonuç bulunamadı.</p>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
