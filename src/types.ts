export interface ReadingLog {
  id: string;
  taskId: string;
  date: string;
  pagesRead: number;
  absolutePage: number;
  note?: string;
}

export interface HatimTask {
  id: string;
  name: string;
  startPage: number;
  endPage: number;
  currentPage: number;
  isCompleted: boolean;
  createdAt: string;
  isReading?: boolean;
  readingStartTime?: string;
  totalReadingTime?: number; // in seconds
}

export interface AIUsage {
  minute: { count: number; timestamp: number };
  hour: { count: number; timestamp: number };
  day: { count: number; timestamp: number };
}

export interface NamazLog {
  id: string;
  date: string; // YYYY-MM-DD
  fajr: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
}

export interface HatimData {
  activeTaskId: string;
  tasks: HatimTask[];
  logs: ReadingLog[];
  namazLogs?: NamazLog[];
  mfaEnabled?: boolean;
  aiUsage?: AIUsage;
  chatHistory?: string; // Encrypted JSON string
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'zikir_invite' | 'new_follower' | 'system_announcement' | 'hatim_completed';
  senderId?: string;
  senderName?: string;
  sessionId?: string;
  sessionName?: string;
  title?: string;
  message?: string;
  createdAt: string;
  read: boolean;
  status?: 'pending' | 'accepted' | 'declined';
}

export interface UserStats {
  totalHatim: number;
  totalZikir: number;
  totalReadPages: number;
  streak: number;
  xp: number;
  level?: number;
  lastReadingDate?: string;
  trustScore?: number;
  totalReadingTime?: number; // in seconds
}

export interface UserProfile {
  uid: string;
  email?: string;
  ntfyTopic?: string;
  username?: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  following?: string[];
  followers?: string[];
  stats?: UserStats;
  usernameChangeHistory?: number[];
  isReading?: boolean;
  currentReadingSession?: {
    type: 'individual' | 'room';
    id: string;
    startTime: string;
  };
}
