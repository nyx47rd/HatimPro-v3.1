import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell, Clock, MessageSquare, Save, ArrowLeft, Check, MapPin, Loader2 } from 'lucide-react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onBack: () => void;
}

interface BaseNotificationConfig {
  enabled: boolean;
}

interface ScheduledNotificationConfig extends BaseNotificationConfig {
  time: string;
  message: string;
}

interface NamazNotificationConfig extends BaseNotificationConfig {
  location?: { lat: number; lng: number; city?: string };
  fajr: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
  offsetMinutes: number;
}

interface UserNotificationSettings {
  zikirInvites: BaseNotificationConfig;
  newFollower: BaseNotificationConfig;
  hatimCompleted: BaseNotificationConfig;
  dailyReminder: ScheduledNotificationConfig;
  namazReminder: NamazNotificationConfig;
}

const DEFAULT_SETTINGS: UserNotificationSettings = {
  zikirInvites: { enabled: true },
  newFollower: { enabled: true },
  hatimCompleted: { enabled: true },
  dailyReminder: { enabled: false, time: '20:00', message: 'Günlük Kuran okumanızı yapmayı unutmayın.' },
  namazReminder: { 
    enabled: false, 
    fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true, 
    offsetMinutes: 15 
  },
};

export function NotificationSettingsPage({ onBack }: Props) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserNotificationSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<any>(null);
  const [ntfyTopic, setNtfyTopic] = useState<string>('');

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.notificationSettings) {
            setSettings({ ...DEFAULT_SETTINGS, ...data.notificationSettings });
          }
          if (data.ntfyTopic) {
            setNtfyTopic(data.ntfyTopic);
          }
        }
      } catch (error) {
        console.error("Error loading notification settings:", error);
      }
    };
    loadSettings();
  }, [user]);

  useEffect(() => {
    if (settings.namazReminder.location) {
      fetchPrayerTimes(settings.namazReminder.location.lat, settings.namazReminder.location.lng);
    }
  }, [settings.namazReminder.location]);

  const fetchPrayerTimes = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=13`);
      const data = await res.json();
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
      }
    } catch (error) {
      console.error("Error fetching prayer times:", error);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Tarayıcınız konum özelliğini desteklemiyor.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setSettings(prev => ({
          ...prev,
          namazReminder: {
            ...prev.namazReminder,
            location: { lat: latitude, lng: longitude, city: "Konumunuz" }
          }
        }));
        setIsLocating(false);
      },
      (error) => {
        console.error("Location error", error);
        alert("Konum alınamadı. Lütfen izin verdiğinizden emin olun.");
        setIsLocating(false);
      }
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationSettings: settings
      });

      // If daily reminder is enabled and we have a topic, 
      // check if we should schedule an immediate reminder for today.
      if (settings.dailyReminder.enabled && ntfyTopic) {
        const [hours, minutes] = settings.dailyReminder.time.split(':').map(Number);
        const now = new Date();
        
        // Convert local target time to a Date object for today
        const targetDate = new Date();
        targetDate.setHours(hours, minutes, 0, 0);

        // If target time is in the future for today, schedule it via ntfy Delay
        if (targetDate > now) {
          const diffMs = targetDate.getTime() - now.getTime();
          const diffMinutes = Math.floor(diffMs / 60000);

          if (diffMinutes > 0) {
            await fetch('/api/notifications/send', {
              method: 'POST',
              body: JSON.stringify({
                title: 'HatimPro Günlük Hatırlatıcı',
                body: settings.dailyReminder.message || "Günlük Kuran okumanızı yapmayı unutmayın.",
                ntfyTopic: ntfyTopic,
                delay: `${diffMinutes}m`
              }),
              headers: { 'content-type': 'application/json' }
            }).catch(err => console.error("Immediate schedule error:", err));
          }
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving notification settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateBaseSetting = (key: keyof UserNotificationSettings, enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled }
    }));
  };

  const updateScheduledSetting = (key: 'dailyReminder', field: keyof ScheduledNotificationConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const updateNamazSetting = (field: keyof NamazNotificationConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      namazReminder: { ...prev.namazReminder, [field]: value }
    }));
  };

  const renderToggle = (enabled: boolean, onChange: () => void) => (
    <button 
      onClick={onChange}
      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-sage-500' : 'bg-neutral-300 dark:bg-white/20'}`}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="p-2 rounded-full hover:bg-sage-100 dark:hover:bg-white/10 transition-colors text-sage-800 dark:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-sage-800 dark:text-white">Bildirim Ayarları</h1>
          <p className="text-sm text-sage-500 dark:text-white/60">Bildirim tercihlerinizi yönetin</p>
        </div>
      </div>

      {/* ntfy.sh Setup */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3 text-blue-400">
          <Bell size={20} />
          <h3 className="font-bold">Anlık Bildirim Kurulumu (ntfy.sh)</h3>
        </div>
        <p className="text-sm text-white/70">
          Bildirimleri telefonunuzda almak için <b>ntfy</b> uygulamasını indirin ve aşağıdaki konuya abone olun:
        </p>
        <div className="bg-black/40 p-3 rounded-xl flex items-center justify-between border border-white/10">
          <code className="text-blue-400 font-mono text-sm">{ntfyTopic || 'Yükleniyor...'}</code>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(ntfyTopic);
              alert("Konu kopyalandı!");
            }}
            className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg font-bold"
          >
            Kopyala
          </button>
        </div>
        <p className="text-xs text-white/50">
          * ntfy uygulamasını açın, "+" butonuna basın ve bu konuyu yazın.
        </p>
        <button 
          onClick={async () => {
            if (!ntfyTopic) return;
            try {
              await fetch('/api/notifications/send', {
                method: 'POST',
                body: JSON.stringify({
                  title: 'Test Bildirimi',
                  body: 'HatimPro bildirim sisteminiz çalışıyor!',
                  ntfyTopic: ntfyTopic
                }),
                headers: { 'content-type': 'application/json' }
              });
              alert("Test bildirimi gönderildi! ntfy uygulamasını kontrol edin.");
            } catch (e) {
              alert("Hata oluştu.");
            }
          }}
          className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
        >
          Test Bildirimi Gönder
        </button>
      </div>

      <div className="space-y-6">
        {/* Etkileşim Bildirimleri */}
        <div className="bg-white dark:bg-white/5 border border-sage-200 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="text-lg font-bold text-sage-800 dark:text-white mb-4">Etkileşim Bildirimleri</h3>
          
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-sage-800 dark:text-white">Zikir Davetleri</p>
              <p className="text-xs text-sage-500 dark:text-white/60">Biri sizi zikir odasına davet ettiğinde</p>
            </div>
            {renderToggle(settings.zikirInvites.enabled, () => updateBaseSetting('zikirInvites', !settings.zikirInvites.enabled))}
          </div>
          
          <div className="flex items-center justify-between py-2 border-t border-sage-100 dark:border-white/10">
            <div>
              <p className="font-medium text-sage-800 dark:text-white">Yeni Takipçi</p>
              <p className="text-xs text-sage-500 dark:text-white/60">Biri sizi takip etmeye başladığında</p>
            </div>
            {renderToggle(settings.newFollower.enabled, () => updateBaseSetting('newFollower', !settings.newFollower.enabled))}
          </div>

          <div className="flex items-center justify-between py-2 border-t border-sage-100 dark:border-white/10">
            <div>
              <p className="font-medium text-sage-800 dark:text-white">Hatim Tamamlandı</p>
              <p className="text-xs text-sage-500 dark:text-white/60">Katıldığınız hatim odasında hatim bittiğinde</p>
            </div>
            {renderToggle(settings.hatimCompleted.enabled, () => updateBaseSetting('hatimCompleted', !settings.hatimCompleted.enabled))}
          </div>
        </div>

        {/* Günlük Hatırlatıcı */}
        <div className="bg-white dark:bg-white/5 border border-sage-200 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-sage-800 dark:text-white">Günlük Okuma Hatırlatıcısı</h3>
              <p className="text-sm text-sage-500 dark:text-white/60">Her gün belirlediğiniz saatte bildirim alın</p>
            </div>
            {renderToggle(settings.dailyReminder.enabled, () => updateScheduledSetting('dailyReminder', 'enabled', !settings.dailyReminder.enabled))}
          </div>

          {settings.dailyReminder.enabled && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="pt-4 border-t border-sage-100 dark:border-white/10 space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-sage-700 dark:text-white/80 flex items-center gap-2">
                  <Clock size={16} />
                  Bildirim Saati
                </label>
                <input 
                  type="time" 
                  value={settings.dailyReminder.time}
                  onChange={(e) => updateScheduledSetting('dailyReminder', 'time', e.target.value)}
                  className="w-full bg-sage-50 dark:bg-black/50 border border-sage-200 dark:border-white/10 rounded-xl px-4 py-3 text-sage-800 dark:text-white focus:outline-none focus:border-sage-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sage-700 dark:text-white/80 flex items-center gap-2">
                  <MessageSquare size={16} />
                  Bildirim Mesajı
                </label>
                <input 
                  type="text" 
                  value={settings.dailyReminder.message}
                  onChange={(e) => updateScheduledSetting('dailyReminder', 'message', e.target.value)}
                  className="w-full bg-sage-50 dark:bg-black/50 border border-sage-200 dark:border-white/10 rounded-xl px-4 py-3 text-sage-800 dark:text-white focus:outline-none focus:border-sage-500"
                  placeholder="Bildirim mesajını girin..."
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Namaz Vakitleri */}
        <div className="bg-white dark:bg-white/5 border border-sage-200 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-sage-800 dark:text-white">Namaz Vakitleri</h3>
              <p className="text-sm text-sage-500 dark:text-white/60">Konumunuza göre namaz vakitlerinde bildirim alın</p>
            </div>
            {renderToggle(settings.namazReminder.enabled, () => updateNamazSetting('enabled', !settings.namazReminder.enabled))}
          </div>

          {settings.namazReminder.enabled && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="pt-4 border-t border-sage-100 dark:border-white/10 space-y-4"
            >
              {!settings.namazReminder.location ? (
                <div className="bg-sage-50 dark:bg-neutral-800/50 p-4 rounded-xl text-center space-y-3">
                  <MapPin className="mx-auto text-sage-500 mb-2" size={24} />
                  <p className="text-sm text-sage-700 dark:text-neutral-300">Namaz vakitlerini hesaplamak için konum izni gereklidir.</p>
                  <button 
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className="bg-sage-500 hover:bg-sage-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
                  >
                    {isLocating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                    Konum İzni Ver
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-sage-50 dark:bg-neutral-800/50 p-3 rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-sage-700 dark:text-neutral-300">
                      <MapPin size={16} className="text-sage-500" />
                      <span>Konum ayarlandı</span>
                    </div>
                    <button onClick={handleGetLocation} className="text-xs text-sage-600 dark:text-sage-400 font-medium hover:underline">
                      Güncelle
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sage-700 dark:text-white/80">Bildirim Zamanı</label>
                    <select 
                      value={settings.namazReminder.offsetMinutes}
                      onChange={(e) => updateNamazSetting('offsetMinutes', parseInt(e.target.value))}
                      className="w-full bg-sage-50 dark:bg-black/50 border border-sage-200 dark:border-white/10 rounded-xl px-4 py-3 text-sage-800 dark:text-white focus:outline-none focus:border-sage-500"
                    >
                      <option value={0}>Tam vaktinde</option>
                      <option value={15}>15 dakika önce</option>
                      <option value={30}>30 dakika önce</option>
                      <option value={45}>45 dakika önce</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sage-700 dark:text-white/80">Hangi Vakitler?</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { key: 'fajr', label: 'Sabah', time: prayerTimes?.Fajr },
                        { key: 'dhuhr', label: 'Öğle', time: prayerTimes?.Dhuhr },
                        { key: 'asr', label: 'İkindi', time: prayerTimes?.Asr },
                        { key: 'maghrib', label: 'Akşam', time: prayerTimes?.Maghrib },
                        { key: 'isha', label: 'Yatsı', time: prayerTimes?.Isha }
                      ].map((vakit) => (
                        <div key={vakit.key} className="flex items-center justify-between p-3 bg-sage-50 dark:bg-black/30 rounded-xl border border-sage-100 dark:border-white/5">
                          <div>
                            <span className="text-sm font-medium text-sage-800 dark:text-white">{vakit.label}</span>
                            {vakit.time && <span className="ml-2 text-xs text-sage-500 dark:text-neutral-400">{vakit.time}</span>}
                          </div>
                          {renderToggle(
                            settings.namazReminder[vakit.key as keyof NamazNotificationConfig] as boolean, 
                            () => updateNamazSetting(vakit.key as keyof NamazNotificationConfig, !settings.namazReminder[vakit.key as keyof NamazNotificationConfig])
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="pt-6">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-sage-500 hover:bg-sage-600 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : saveSuccess ? (
            <>
              <Check size={20} />
              Kaydedildi
            </>
          ) : (
            <>
              <Save size={20} />
              Ayarları Kaydet
            </>
          )}
        </button>
      </div>
    </div>
  );
}
