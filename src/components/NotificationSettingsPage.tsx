import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell, Clock, MessageSquare, Save, ArrowLeft, Check, X } from 'lucide-react';
import { HatimData } from '../types';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onBack: () => void;
}

interface NotificationConfig {
  enabled: boolean;
  time: string;
  message: string;
}

interface UserNotificationSettings {
  dailyReminder: NotificationConfig;
  hatimReminder: NotificationConfig;
  zikirReminder: NotificationConfig;
  namazReminder: NotificationConfig;
}

const DEFAULT_SETTINGS: UserNotificationSettings = {
  dailyReminder: { enabled: true, time: '20:00', message: 'Günlük okumanızı yapmayı unutmayın.' },
  hatimReminder: { enabled: true, time: '10:00', message: 'Hatim odanızda yeni mesajlar var.' },
  zikirReminder: { enabled: false, time: '08:00', message: 'Günlük zikirlerinizi tamamladınız mı?' },
  namazReminder: { enabled: true, time: '05:00', message: 'Namaz vakti yaklaşıyor.' },
};

export function NotificationSettingsPage({ onBack }: Props) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserNotificationSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().notificationSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data().notificationSettings });
        }
      } catch (error) {
        console.error("Error loading notification settings:", error);
      }
    };
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationSettings: settings
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving notification settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: keyof UserNotificationSettings, field: keyof NotificationConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const renderSettingSection = (title: string, key: keyof UserNotificationSettings, description: string) => {
    const config = settings[key];
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-sm text-white/60">{description}</p>
          </div>
          <button 
            onClick={() => updateSetting(key, 'enabled', !config.enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-sage-500' : 'bg-white/20'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.enabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {config.enabled && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-4 border-t border-white/10 space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                <Clock size={16} />
                Bildirim Saati
              </label>
              <input 
                type="time" 
                value={config.time}
                onChange={(e) => updateSetting(key, 'time', e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sage-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                <MessageSquare size={16} />
                Bildirim Mesajı
              </label>
              <input 
                type="text" 
                value={config.message}
                onChange={(e) => updateSetting(key, 'message', e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sage-500"
                placeholder="Bildirim mesajını girin..."
              />
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Bildirim Ayarları</h1>
          <p className="text-sm text-white/60">Bildirim saatlerini ve mesajlarını özelleştirin</p>
        </div>
      </div>

      <div className="space-y-6">
        {renderSettingSection('Günlük Okuma Hatırlatıcısı', 'dailyReminder', 'Her gün Kuran okumanızı hatırlatır')}
        {renderSettingSection('Hatim Odası Bildirimleri', 'hatimReminder', 'Hatim odalarındaki etkinlikleri bildirir')}
        {renderSettingSection('Zikir Hatırlatıcısı', 'zikirReminder', 'Günlük zikir hedeflerinizi hatırlatır')}
        {renderSettingSection('Namaz Vakti Bildirimleri', 'namazReminder', 'Namaz vakitleri yaklaştığında uyarır')}
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
