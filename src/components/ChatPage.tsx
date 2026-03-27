import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Send, Bot, Trash2, ArrowLeft, Shield, Menu, SquarePen } from 'lucide-react';
import { encryptData, decryptData, getRawKeyBase64 } from '../lib/encryption';
import { HatimData, UserProfile } from '../types';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

interface ChatPageProps {
  onBack?: () => void;
  appData?: HatimData;
  setData?: React.Dispatch<React.SetStateAction<HatimData>>;
  profile?: UserProfile | null;
}

const LIMITS = {
  minute: 5,
  hour: 20,
  day: 100
};

const PENDING_CHAT_KEY = 'hatim_pending_chat';
const OFFLINE_QUEUE_KEY = 'hatim_offline_chat_queue';

const DEFAULT_MESSAGES: Message[] = [
  { role: 'assistant', content: 'Selamün Aleyküm! Size dini konularda nasıl yardımcı olabilirim? Konuşmalarımız uçtan uca şifrelenmektedir.', id: 'welcome' }
];

export const ChatPage: React.FC<ChatPageProps> = ({ onBack, appData, setData, profile }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => window.crypto.randomUUID());
  const [currentMessages, setCurrentMessages] = useState<Message[]>(DEFAULT_MESSAGES);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  
  const [pendingRequest, setPendingRequest] = useState<{ apiChatId: string, sessionId: string } | null>(() => {
    const stored = localStorage.getItem(PENDING_CHAT_KEY);
    try { return stored ? JSON.parse(stored) : null; } catch { return null; }
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentSessionIdRef = useRef(currentSessionId);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
      if (appData?.chatHistory && !isHistoryLoaded) {
        try {
          const decrypted = await decryptData(appData.chatHistory);
          if (decrypted) {
            const parsed = JSON.parse(decrypted);
            if (Array.isArray(parsed)) {
              if (parsed.length > 0 && parsed[0].role) {
                // Legacy format: array of messages
                const legacySession: ChatSession = {
                  id: window.crypto.randomUUID(),
                  title: 'Önceki Sohbet',
                  messages: parsed,
                  updatedAt: Date.now()
                };
                setSessions([legacySession]);
              } else if (parsed.length > 0 && parsed[0].messages) {
                // New format: array of sessions
                setSessions(parsed);
              }
            }
          }
        } catch (e) {
          console.error("Failed to load chat history", e);
        }
      }
      setIsHistoryLoaded(true);
    };
    loadHistory();
  }, [appData?.chatHistory, isHistoryLoaded]);

  // Force new session on initial load if we have history
  useEffect(() => {
    if (isHistoryLoaded) {
      // Create a fresh session ID on load to ensure Ctrl+R starts a new chat
      const newId = window.crypto.randomUUID();
      setCurrentSessionId(newId);
      setCurrentMessages(DEFAULT_MESSAGES);
    }
  }, [isHistoryLoaded]);

  // Save chat history whenever sessions change
  useEffect(() => {
    const saveHistory = async () => {
      if (isHistoryLoaded && setData) {
        try {
          // Filter out empty sessions or sessions with only the default message
          const validSessions = sessions.filter(s => s.messages.length > 1);
          const encrypted = await encryptData(JSON.stringify(validSessions));
          setData(prev => ({ ...prev, chatHistory: encrypted }));
        } catch (e) {
          console.error("Failed to save chat history", e);
        }
      }
    };
    saveHistory();
  }, [sessions, isHistoryLoaded, setData]);

  // Sync currentMessages to sessions array
  useEffect(() => {
    if (currentMessages.length > 1) {
      setSessions(prev => {
        const exists = prev.find(s => s.id === currentSessionId);
        if (exists) {
          // Only update updatedAt if the number of messages changed
          if (exists.messages.length !== currentMessages.length) {
            return prev.map(s => s.id === currentSessionId ? { ...s, messages: currentMessages, updatedAt: Date.now() } : s);
          }
          return prev;
        } else {
          const firstUserMsg = currentMessages.find(m => m.role === 'user')?.content || 'Yeni Sohbet';
          const title = firstUserMsg.slice(0, 30) + (firstUserMsg.length > 30 ? '...' : '');
          return [{ id: currentSessionId, title, messages: currentMessages, updatedAt: Date.now() }, ...prev];
        }
      });
    }
  }, [currentMessages, currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // Poll for pending chat
  useEffect(() => {
    if (!pendingRequest) return;
    
    setIsLoading(true);
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/status?chatId=${pendingRequest.apiChatId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed' || data.status === 'error') {
            clearInterval(pollInterval);
            localStorage.removeItem(PENDING_CHAT_KEY);
            setPendingRequest(null);
            setIsLoading(false);
            
            let newMsgContent = '';
            if (data.status === 'completed') {
              const keyBase64 = getRawKeyBase64();
              if (keyBase64 && data.encryptedData) {
                const decrypted = await decryptData(data.encryptedData);
                newMsgContent = decrypted || 'Hata: Şifre çözülemedi.';
              } else {
                newMsgContent = 'Hata: Şifreleme anahtarı bulunamadı.';
              }
            } else {
              newMsgContent = `Hata: ${data.error}`;
            }

            const newMsg: Message = { role: 'assistant', content: newMsgContent, id: pendingRequest.apiChatId };

            if (pendingRequest.sessionId === currentSessionIdRef.current) {
              setCurrentMessages(prev => {
                if (prev.some(m => m.id === pendingRequest.apiChatId)) return prev;
                return [...prev, newMsg];
              });
            } else {
              setSessions(prev => prev.map(s => {
                if (s.id === pendingRequest.sessionId) {
                  if (s.messages.some(m => m.id === pendingRequest.apiChatId)) return s;
                  return { ...s, messages: [...s.messages, newMsg], updatedAt: Date.now() };
                }
                return s;
              }));
            }
          }
        } else if (res.status === 404) {
          clearInterval(pollInterval);
          localStorage.removeItem(PENDING_CHAT_KEY);
          setPendingRequest(null);
          setIsLoading(false);
        }
      } catch (e) {
        // Network error, keep polling
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [pendingRequest]);

  // Check for offline queue
  useEffect(() => {
    const checkOfflineQueue = async () => {
      if (pendingRequest) return;

      const queued = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (queued) {
        try {
          const { messages: qMessages, chatId: qChatId, sessionId: qSessionId } = JSON.parse(queued);
          const encryptionKey = getRawKeyBase64();
          if (encryptionKey) {
            const response = await fetch('/api/chat/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: qMessages, encryptionKey, chatId: qChatId })
            });
            if (response.ok) {
              localStorage.removeItem(OFFLINE_QUEUE_KEY);
              const newReq = { apiChatId: qChatId, sessionId: qSessionId || currentSessionIdRef.current };
              localStorage.setItem(PENDING_CHAT_KEY, JSON.stringify(newReq));
              setPendingRequest(newReq);
            }
          }
        } catch (e) {}
      }
    };

    const interval = setInterval(checkOfflineQueue, 10000);
    checkOfflineQueue();
    return () => clearInterval(interval);
  }, [pendingRequest]);

  const startNewSession = () => {
    setCurrentSessionId(window.crypto.randomUUID());
    setCurrentMessages(DEFAULT_MESSAGES);
    setIsSidebarOpen(false);
  };

  const switchSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setCurrentMessages(session.messages);
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (newSessions.length === 0 && setData) {
        encryptData(JSON.stringify([])).then(encrypted => {
          setData(d => ({ ...d, chatHistory: encrypted }));
        });
      }
      return newSessions;
    });
    if (currentSessionId === id) {
      startNewSession();
    }
  };

  const handleClearChat = () => {
    setCurrentMessages(DEFAULT_MESSAGES);
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== currentSessionId);
      // If we clear the last session, we should update the storage
      if (newSessions.length === 0 && setData) {
        encryptData(JSON.stringify([])).then(encrypted => {
          setData(d => ({ ...d, chatHistory: encrypted }));
        });
      }
      return newSessions;
    });
    setCurrentSessionId(window.crypto.randomUUID());
  };

  const checkRateLimit = (): boolean => {
    if (!appData || !setData) return true;
    
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60000);
    const currentHour = Math.floor(now.getTime() / 3600000);
    const currentDay = Math.floor(now.getTime() / 86400000);

    const usage = appData.aiUsage || {
      minute: { count: 0, timestamp: 0 },
      hour: { count: 0, timestamp: 0 },
      day: { count: 0, timestamp: 0 }
    };

    if (usage.minute.timestamp === currentMinute && usage.minute.count >= LIMITS.minute) return false;
    if (usage.hour.timestamp === currentHour && usage.hour.count >= LIMITS.hour) return false;
    if (usage.day.timestamp === currentDay && usage.day.count >= LIMITS.day) return false;

    let newUsage = {
      minute: { ...usage.minute },
      hour: { ...usage.hour },
      day: { ...usage.day }
    };

    if (newUsage.minute.timestamp === currentMinute) newUsage.minute.count += 1;
    else newUsage.minute = { count: 1, timestamp: currentMinute };

    if (newUsage.hour.timestamp === currentHour) newUsage.hour.count += 1;
    else newUsage.hour = { count: 1, timestamp: currentHour };

    if (newUsage.day.timestamp === currentDay) newUsage.day.count += 1;
    else newUsage.day = { count: 1, timestamp: currentDay };

    setData(prev => ({ ...prev, aiUsage: newUsage }));
    return true;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!checkRateLimit()) {
      setCurrentMessages(prev => [...prev, { role: 'assistant', content: 'Hata: Yapay zeka kullanım limitinize ulaştınız. Lütfen daha sonra tekrar deneyin. Limitlerinizi "Diğer" menüsünden kontrol edebilirsiniz.' }]);
      return;
    }

    const userMessage = input.trim();
    const userMessageId = window.crypto.randomUUID();
    setInput('');
    
    const newMessages: Message[] = [...currentMessages, { role: 'user', content: userMessage, id: userMessageId }];
    setCurrentMessages(newMessages);
    setIsLoading(true);

    const appDataSummary = appData ? {
      aktifGorevler: appData.tasks?.slice(0, 10).map(t => ({
        isim: t.name,
        tamamlandiMi: t.isCompleted,
        okunanSayfa: t.currentPage,
        toplamSayfa: t.endPage,
        okumaSuresiSaniye: t.totalReadingTime || 0
      })),
      kullaniciSeviyesi: profile?.stats?.level || 1,
      tecrubePuaniXP: profile?.stats?.xp || 0,
      seriGunSayisi: profile?.stats?.streak || 0,
      toplamOkumaSuresiSaniye: profile?.stats?.totalReadingTime || 0
    } : {};

    const systemPrompt = `Sen HatimPro uygulamasının akıllı asistanısın. Hem dini konularda (İslami sorular, ayet, hadis) yardımcı olursun, hem de kullanıcının uygulama içi verilerini analiz edip ona rehberlik edersin. Dini olmayan genel sohbetlere nazikçe kapalı olduğunu belirt.
    
    Kullanıcının güncel uygulama verileri aşağıdadır. Bu verileri kullanarak kullanıcının durumuna özel cevaplar verebilirsin. 
    
    ÖNEMLİ KURALLAR:
    1. Kullanıcıya ASLA "JSON verisi", "bana gönderdiğin veriler", "sistem verisi" gibi teknik terimlerden bahsetme. Bu bilgileri sanki sen zaten biliyormuşsun gibi doğal bir dille kullan.
    2. Süreler (okumaSuresiSaniye, toplamOkumaSuresiSaniye) saniye cinsindendir. Kullanıcıya söylerken ASLA "birim" veya "saniye" diyerek bırakma, her zaman dakika veya saate çevirerek (örn: "2 saat 15 dakika" veya "45 dakika") doğal bir dille ifade et.
    3. Kullanıcı sormadıkça durduk yere istatistiklerini sayma, sadece bağlam uygunsa motive etmek için kullan.
    
    Kullanıcı Verileri:
    ${JSON.stringify(appDataSummary, null, 2)}`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...newMessages.filter(m => m.role !== 'system')
    ];

    const encryptionKey = getRawKeyBase64();
    if (!encryptionKey) {
      setCurrentMessages(prev => [...prev, { role: 'assistant', content: 'Hata: Şifreleme anahtarı bulunamadı.' }]);
      setIsLoading(false);
      return;
    }

    const chatId = window.crypto.randomUUID();
    
    const sendRequest = async () => {
      try {
        const response = await fetch('/api/chat/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, encryptionKey, chatId })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Sunucu Hatası (${response.status}): ${errText.slice(0, 100)}...`);
        }

        const newReq = { apiChatId: chatId, sessionId: currentSessionId };
        localStorage.setItem(PENDING_CHAT_KEY, JSON.stringify(newReq));
        setPendingRequest(newReq);
      } catch (error: any) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify({ messages: apiMessages, chatId, sessionId: currentSessionId }));
          setCurrentMessages(prev => [...prev, { role: 'assistant', content: 'İnternet bağlantınız zayıf. Mesajınız kuyruğa alındı ve bağlantı düzeldiğinde otomatik olarak gönderilecek.', id: `queued-${chatId}` }]);
        } else {
          setCurrentMessages(prev => [...prev, { role: 'assistant', content: `Hata: ${error.message}`, id: `error-${chatId}` }]);
        }
        setIsLoading(false);
      }
    };

    sendRequest();
  };

  return (
    <div className="flex h-full w-full bg-[#F2F2F7] dark:bg-black relative overflow-hidden">
      
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        absolute z-40 h-full w-[280px] bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border-r border-black/5 dark:border-white/5 flex flex-col transition-transform duration-300 ease-in-out shrink-0
        ${isSidebarOpen ? 'translate-x-0 md:relative' : '-translate-x-full'}
      `}>
        <div className="p-4 flex items-center justify-between border-b border-black/5 dark:border-white/5">
          <h3 className="font-semibold text-black dark:text-white">Sohbetler</h3>
          <button onClick={startNewSession} className="p-2 bg-black/5 dark:bg-white/10 rounded-full text-[#007AFF] hover:bg-black/10 dark:hover:bg-white/20 transition-colors">
            <SquarePen size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
            <div 
              key={session.id}
              onClick={() => switchSession(session.id)}
              className={`w-full text-left px-3 py-3 rounded-xl flex items-center justify-between group cursor-pointer transition-colors ${
                currentSessionId === session.id 
                  ? 'bg-[#007AFF]/10 dark:bg-[#007AFF]/20' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <p className={`text-[15px] truncate ${currentSessionId === session.id ? 'text-[#007AFF] font-medium' : 'text-black dark:text-white'}`}>
                  {session.title}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40 mt-0.5">
                  {new Date(session.updatedAt).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button 
                onClick={(e) => handleDeleteSession(session.id, e)}
                className="p-1.5 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-center text-sm text-black/40 dark:text-white/40 mt-10">Henüz sohbet yok</p>
          )}
        </div>
        <div className="p-4 border-t border-black/5 dark:border-white/5 flex flex-col items-center gap-3">
          <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge&logo=data:image/png;base64,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&logoColor=white&labelColor=6a0dad" alt="Built with Pollinations" className="h-8" />
          </a>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-black/5 dark:border-white/5 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 text-[#007AFF] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
              <Menu size={24} />
            </button>
            {onBack && !isSidebarOpen && (
              <button 
                onClick={onBack}
                className="p-2 -ml-2 text-[#007AFF] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors md:hidden"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
                <Bot size={20} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-black dark:text-white leading-tight">Dini Asistan</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Çevrimiçi</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClearChat}
              className="p-2 text-[#007AFF] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
              title="Sohbeti Temizle"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <div className="max-w-3xl mx-auto space-y-4 w-full">
            {currentMessages.filter(m => m.role !== 'system').map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  key={msg.id || index}
                  className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] md:max-w-[75%] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                    isUser 
                      ? 'bg-[#007AFF] text-white rounded-[20px] rounded-br-[4px]' 
                      : 'bg-white dark:bg-[#2C2C2E] text-black dark:text-white rounded-[20px] rounded-bl-[4px] border border-black/5 dark:border-white/5'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </motion.div>
              );
            })}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="flex w-full justify-start"
              >
                <div className="bg-white dark:bg-[#2C2C2E] border border-black/5 dark:border-white/5 rounded-[20px] rounded-bl-[4px] px-4 py-3.5 shadow-sm flex items-center gap-1.5">
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </div>

        {/* Input Area */}
        <div className="px-4 py-3 pb-6 md:pb-3 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-t border-black/5 dark:border-white/5 sticky bottom-0 z-20">
          <form onSubmit={sendMessage} className="flex items-end gap-2 max-w-3xl mx-auto w-full">
            <div className="flex-1 bg-black/5 dark:bg-white/10 rounded-3xl flex items-center px-4 py-1 min-h-[44px]">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Mesaj yazın..."
                className="flex-1 bg-transparent border-none focus:outline-none text-[15px] text-black dark:text-white py-2 placeholder:text-black/40 dark:placeholder:text-white/40"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all ${
                input.trim() && !isLoading 
                  ? 'bg-[#007AFF] text-white shadow-md scale-100' 
                  : 'bg-black/5 dark:bg-white/10 text-black/30 dark:text-white/30 scale-95'
              }`}
            >
              <Send size={18} className={input.trim() && !isLoading ? 'ml-0.5' : ''} />
            </button>
          </form>
          <p className="text-center text-[10px] text-black/40 dark:text-white/40 mt-2 flex items-center justify-center gap-1 font-medium">
            <Shield size={10} />
            Uçtan uca şifreli • <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="hover:underline">Powered by Pollinations.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
};
