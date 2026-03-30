import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Calendar, ChevronLeft, ChevronRight, Moon, Sun, Sunrise, Sunset, CloudMoon } from 'lucide-react';
import { NamazLog, HatimData } from '../types';

interface Props {
  data: HatimData;
  setData: React.Dispatch<React.SetStateAction<HatimData>>;
}

const PRAYERS = [
  { id: 'fajr', name: 'Sabah', icon: Sunrise },
  { id: 'dhuhr', name: 'Öğle', icon: Sun },
  { id: 'asr', name: 'İkindi', icon: CloudMoon },
  { id: 'maghrib', name: 'Akşam', icon: Sunset },
  { id: 'isha', name: 'Yatsı', icon: Moon },
] as const;

export function NamazTakipPage({ data, setData }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const dateString = currentDate.toISOString().split('T')[0];
  
  const todayLog = useMemo(() => {
    return data.namazLogs?.find(log => log.date === dateString) || {
      id: crypto.randomUUID(),
      date: dateString,
      fajr: false,
      dhuhr: false,
      asr: false,
      maghrib: false,
      isha: false,
    };
  }, [data.namazLogs, dateString]);

  const togglePrayer = (prayerId: keyof Omit<NamazLog, 'id' | 'date'>) => {
    setData(prev => {
      const logs = prev.namazLogs || [];
      const existingLogIndex = logs.findIndex(l => l.date === dateString);
      
      let newLogs = [...logs];
      if (existingLogIndex >= 0) {
        newLogs[existingLogIndex] = {
          ...newLogs[existingLogIndex],
          [prayerId]: !newLogs[existingLogIndex][prayerId]
        };
      } else {
        newLogs.push({
          ...todayLog,
          [prayerId]: !todayLog[prayerId]
        });
      }
      
      return { ...prev, namazLogs: newLogs };
    });
  };

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const completedCount = PRAYERS.filter(p => todayLog[p.id as keyof Omit<NamazLog, 'id' | 'date'>]).length;
  const progress = (completedCount / PRAYERS.length) * 100;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Namaz Takip</h1>
          <p className="text-white/60">Günlük 5 vakit namazınızı takip edin</p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-6">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => changeDate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <ChevronLeft size={24} />
          </button>
          
          <div className="flex items-center gap-3 text-lg font-medium">
            <Calendar className="text-sage-400" size={20} />
            {currentDate.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>

          <button 
            onClick={() => changeDate(1)}
            disabled={currentDate.toDateString() === new Date().toDateString()}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/60"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="mb-8">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">Günlük İlerleme</span>
            <span className="text-sage-400 font-medium">{completedCount} / 5</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-sage-500 rounded-full"
            />
          </div>
        </div>

        <div className="space-y-3">
          {PRAYERS.map((prayer) => {
            const isCompleted = todayLog[prayer.id as keyof Omit<NamazLog, 'id' | 'date'>];
            const Icon = prayer.icon;
            
            return (
              <button
                key={prayer.id}
                onClick={() => togglePrayer(prayer.id as keyof Omit<NamazLog, 'id' | 'date'>)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-sage-500/20 border border-sage-500/30' 
                    : 'bg-white/5 border border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${isCompleted ? 'bg-sage-500/30 text-sage-400' : 'bg-white/10 text-white/60'}`}>
                    <Icon size={24} />
                  </div>
                  <span className={`text-lg font-medium ${isCompleted ? 'text-sage-400' : 'text-white'}`}>
                    {prayer.name}
                  </span>
                </div>
                
                <div className={`transition-colors duration-300 ${isCompleted ? 'text-sage-400' : 'text-white/20'}`}>
                  {isCompleted ? <CheckCircle2 size={28} /> : <Circle size={28} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
