import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Send, Bot, Trash2, ArrowLeft, Shield } from 'lucide-react';
import { encryptData, decryptData, getRawKeyBase64 } from '../lib/encryption';
import { HatimData, UserProfile } from '../types';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
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

export const ChatPage: React.FC<ChatPageProps> = ({ onBack, appData, setData, profile }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Selamün Aleyküm! Size dini konularda nasıl yardımcı olabilirim? Konuşmalarımız uçtan uca şifrelenmektedir.', id: 'welcome' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [pendingChatId, setPendingChatId] = useState<string | null>(() => localStorage.getItem(PENDING_CHAT_KEY));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
      if (appData?.chatHistory && !isHistoryLoaded) {
        try {
          const decrypted = await decryptData(appData.chatHistory);
          if (decrypted) {
            const parsed = JSON.parse(decrypted);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed);
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

  // Save chat history whenever messages change
  useEffect(() => {
    const saveHistory = async () => {
      if (isHistoryLoaded && setData && messages.length > 1) {
        try {
          const encrypted = await encryptData(JSON.stringify(messages));
          setData(prev => ({ ...prev, chatHistory: encrypted }));
        } catch (e) {
          console.error("Failed to save chat history", e);
        }
      }
    };
    saveHistory();
  }, [messages, isHistoryLoaded, setData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for pending chat
  useEffect(() => {
    if (!pendingChatId) return;
    
    setIsLoading(true);
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/status?chatId=${pendingChatId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed') {
            clearInterval(pollInterval);
            localStorage.removeItem(PENDING_CHAT_KEY);
            
            const keyBase64 = getRawKeyBase64();
            if (keyBase64 && data.encryptedData) {
              const decrypted = await decryptData(data.encryptedData);
              if (decrypted) {
                setMessages(prev => {
                  if (prev.some(m => m.id === pendingChatId)) return prev;
                  return [...prev, { role: 'assistant', content: decrypted, id: pendingChatId }];
                });
              }
            } else {
              setMessages(prev => [...prev, { role: 'assistant', content: 'Hata: Şifre çözülemedi.', id: pendingChatId }]);
            }
            setPendingChatId(null);
            setIsLoading(false);
          } else if (data.status === 'error') {
            clearInterval(pollInterval);
            localStorage.removeItem(PENDING_CHAT_KEY);
            setMessages(prev => [...prev, { role: 'assistant', content: `Hata: ${data.error}`, id: pendingChatId }]);
            setPendingChatId(null);
            setIsLoading(false);
          }
        } else if (res.status === 404) {
          clearInterval(pollInterval);
          localStorage.removeItem(PENDING_CHAT_KEY);
          setPendingChatId(null);
          setIsLoading(false);
        }
      } catch (e) {
        // Network error, keep polling
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [pendingChatId]);

  // Check for offline queue
  useEffect(() => {
    const checkOfflineQueue = async () => {
      if (pendingChatId) return;

      const queued = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (queued) {
        try {
          const { messages: qMessages, chatId: qChatId } = JSON.parse(queued);
          const encryptionKey = getRawKeyBase64();
          if (encryptionKey) {
            const response = await fetch('/api/chat/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: qMessages, encryptionKey, chatId: qChatId })
            });
            if (response.ok) {
              localStorage.removeItem(OFFLINE_QUEUE_KEY);
              localStorage.setItem(PENDING_CHAT_KEY, qChatId);
              setPendingChatId(qChatId);
            }
          }
        } catch (e) {}
      }
    };

    const interval = setInterval(checkOfflineQueue, 10000);
    checkOfflineQueue();
    return () => clearInterval(interval);
  }, [pendingChatId]);

  const handleClearChat = async () => {
    const defaultMessages: Message[] = [
      { role: 'assistant', content: 'Selamün Aleyküm! Size dini konularda nasıl yardımcı olabilirim? Konuşmalarımız uçtan uca şifrelenmektedir.', id: 'welcome' }
    ];
    setMessages(defaultMessages);
    if (setData) {
      try {
        const encrypted = await encryptData(JSON.stringify(defaultMessages));
        setData(prev => ({ ...prev, chatHistory: encrypted }));
      } catch (e) {
        console.error("Failed to clear chat history", e);
      }
    }
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

    // Check limits first
    if (usage.minute.timestamp === currentMinute && usage.minute.count >= LIMITS.minute) return false;
    if (usage.hour.timestamp === currentHour && usage.hour.count >= LIMITS.hour) return false;
    if (usage.day.timestamp === currentDay && usage.day.count >= LIMITS.day) return false;

    let newUsage = {
      minute: { ...usage.minute },
      hour: { ...usage.hour },
      day: { ...usage.day }
    };

    // Increment Minute
    if (newUsage.minute.timestamp === currentMinute) {
      newUsage.minute.count += 1;
    } else {
      newUsage.minute = { count: 1, timestamp: currentMinute };
    }

    // Increment Hour
    if (newUsage.hour.timestamp === currentHour) {
      newUsage.hour.count += 1;
    } else {
      newUsage.hour = { count: 1, timestamp: currentHour };
    }

    // Increment Day
    if (newUsage.day.timestamp === currentDay) {
      newUsage.day.count += 1;
    } else {
      newUsage.day = { count: 1, timestamp: currentDay };
    }

    setData(prev => ({ ...prev, aiUsage: newUsage }));
    return true;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!checkRateLimit()) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hata: Yapay zeka kullanım limitinize ulaştınız. Lütfen daha sonra tekrar deneyin. Limitlerinizi "Diğer" menüsünden kontrol edebilirsiniz.' }]);
      return;
    }

    const userMessage = input.trim();
    const userMessageId = window.crypto.randomUUID();
    setInput('');
    
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage, id: userMessageId }];
    setMessages(newMessages);
    setIsLoading(true);

    const appDataSummary = appData ? {
      tasks: appData.tasks?.slice(0, 10),
      xp: profile?.stats?.xp || 0,
      level: profile?.stats?.level || 1,
      streak: profile?.stats?.streak || 0
    } : {};

    const systemPrompt = `Sen HatimPro uygulamasının akıllı asistanısın. Hem dini konularda (İslami sorular, ayet, hadis) yardımcı olursun, hem de kullanıcının uygulama içi verilerini analiz edip ona rehberlik edersin. Dini olmayan genel sohbetlere nazikçe kapalı olduğunu belirt.
    
    Kullanıcının güncel uygulama verileri (Özet) JSON formatında aşağıdadır. Bu verileri kullanarak kullanıcının durumuna özel cevaplar verebilirsin:
    ${JSON.stringify(appDataSummary)}`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...newMessages.filter(m => m.role !== 'system')
    ];

    const encryptionKey = getRawKeyBase64();
    if (!encryptionKey) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hata: Şifreleme anahtarı bulunamadı.' }]);
      setIsLoading(false);
      return;
    }

    const chatId = window.crypto.randomUUID();
    
    const sendRequest = async () => {
      try {
        const response = await fetch('/api/chat/request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: apiMessages,
            encryptionKey,
            chatId
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Sunucu Hatası (${response.status}): ${errText.slice(0, 100)}...`);
        }

        localStorage.setItem(PENDING_CHAT_KEY, chatId);
        setPendingChatId(chatId);
      } catch (error: any) {
        // If it's a network error, queue it for later
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify({ messages: apiMessages, chatId }));
          setMessages(prev => [...prev, { role: 'assistant', content: 'İnternet bağlantınız zayıf. Mesajınız kuyruğa alındı ve bağlantı düzeldiğinde otomatik olarak gönderilecek.', id: `queued-${chatId}` }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `Hata: ${error.message}`, id: `error-${chatId}` }]);
        }
        setIsLoading(false);
      }
    };

    sendRequest();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#F2F2F7] dark:bg-black relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-black/5 dark:border-white/5 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {onBack && (
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
        <button
          onClick={handleClearChat}
          className="p-2 text-[#007AFF] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
          title="Sohbeti Temizle"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4 w-full">
          {messages.filter(m => m.role !== 'system').map((msg, index) => {
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
          Uçtan uca şifreli
        </p>
      </div>
    </div>
  );
};
