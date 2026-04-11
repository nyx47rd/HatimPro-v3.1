import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Target, Users, Search, X, Trophy, ShieldAlert, Clock, Mic } from 'lucide-react';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onBack: () => void;
  playClick: () => void;
}

type MatchStatus = 'idle' | 'searching' | 'matched' | 'active' | 'finished';

export function ZikirArenaPage({ onBack, playClick }: Props) {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  
  // Active Match State
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [targetZikir, setTargetZikir] = useState('Sübhanallah');
  const [matchResult, setMatchResult] = useState<'win' | 'loss' | 'draw' | null>(null);

  const [warnings, setWarnings] = useState(0);
  const [guardianMessage, setGuardianMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Voice Chat State
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  const zgp = profile?.stats?.zgp ?? 1000;

  const statusRef = React.useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    const currentUid = user?.uid;
    return () => {
      if (statusRef.current === 'searching' && currentUid) {
        deleteDoc(doc(db, 'arena_matchmaking', currentUid)).catch(console.error);
      }
    };
  }, [user?.uid]);

  // AI Guardian - Speech Recognition
  useEffect(() => {
    let recognition: any = null;
    let isMounted = true;

    if (status === 'active' && matchId && user) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'tr-TR';

        recognition.onstart = () => {
          if (isMounted) setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          if (!isMounted) return;
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const transcript = (finalTranscript || interimTranscript).toLowerCase();
          
          // Simple AI Guardian Logic
          if (transcript.length > 0) {
            const words = transcript.split(' ');
            const targetWord = targetZikir.toLowerCase();
            
            // Allow some common filler words or slight variations, but penalize completely unrelated speech
            const isRelated = words.some(word => 
              word.includes(targetWord) || 
              targetWord.includes(word) ||
              word === 'allah' || 
              word === 'bismillah'
            );

            if (!isRelated && words.length > 2) {
              // Detected unrelated speech
              setGuardianMessage(`Uyarı: Lütfen sadece "${targetZikir}" zikrine odaklanın.`);
              setWarnings(prev => {
                const newWarnings = prev + 1;
                if (newWarnings >= 3) {
                  // Disqualify
                  disqualify();
                }
                return newWarnings;
              });
              
              // Clear message after 3 seconds
              setTimeout(() => {
                if (isMounted) setGuardianMessage(null);
              }, 3000);
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (isMounted) setIsListening(false);
        };

        recognition.onend = () => {
          // Restart if still active and mounted
          if (isMounted && status === 'active') {
            try {
              recognition.start();
            } catch (e) {}
          } else if (isMounted) {
            setIsListening(false);
          }
        };

        try {
          recognition.start();
        } catch (e) {
          console.error("Could not start speech recognition", e);
        }
      } else {
        setGuardianMessage("Tarayıcınız ses tanıma özelliğini desteklemiyor. AI Guardian devre dışı.");
      }
    }

    return () => {
      isMounted = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
      setIsListening(false);
    };
  }, [status, matchId, user, targetZikir]);

  // Simple WebRTC Voice Chat
  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;
    let isMounted = true;
    let unsubs: (() => void)[] = [];

    const initWebRTC = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) {
          localStream.getTracks().forEach(t => t.stop());
          return;
        }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        localStream.getTracks().forEach(track => {
          pc?.addTrack(track, localStream!);
        });

        pc.ontrack = (event) => {
          const remoteAudio = new Audio();
          remoteAudio.srcObject = event.streams[0];
          remoteAudio.play().catch(console.error);
        };

        const matchRef = doc(db, 'arena_matches', matchId!);
        const matchSnap = await getDoc(matchRef);
        const data = matchSnap.data();
        if (!data || !isMounted) return;
        
        const players = Object.keys(data.players);
        players.sort();
        const isCaller = players[0] === user?.uid;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidateDoc = doc(collection(matchRef, isCaller ? 'callerCandidates' : 'calleeCandidates'));
            setDoc(candidateDoc, event.candidate.toJSON());
          }
        };

        if (isCaller) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await updateDoc(matchRef, { offer: { type: offer.type, sdp: offer.sdp } });

          const unsubAnswer = onSnapshot(matchRef, (snap) => {
            const data = snap.data();
            if (data?.answer && !pc?.currentRemoteDescription) {
              const answer = new RTCSessionDescription(data.answer);
              pc?.setRemoteDescription(answer);
            }
          });
          unsubs.push(unsubAnswer);

          const unsubCandidates = onSnapshot(collection(matchRef, 'calleeCandidates'), (snap) => {
            snap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc?.addIceCandidate(candidate);
              }
            });
          });
          unsubs.push(unsubCandidates);
        } else {
          const unsubOffer = onSnapshot(matchRef, async (snap) => {
            const data = snap.data();
            if (data?.offer && !pc?.currentRemoteDescription) {
              const offer = new RTCSessionDescription(data.offer);
              await pc?.setRemoteDescription(offer);
              const answer = await pc?.createAnswer();
              await pc?.setLocalDescription(answer);
              await updateDoc(matchRef, { answer: { type: answer.type, sdp: answer.sdp } });
            }
          });
          unsubs.push(unsubOffer);

          const unsubCandidates = onSnapshot(collection(matchRef, 'callerCandidates'), (snap) => {
            snap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc?.addIceCandidate(candidate);
              }
            });
          });
          unsubs.push(unsubCandidates);
        }
        
        if (isMounted) setIsVoiceConnected(true);
      } catch (error) {
        console.error("WebRTC init error:", error);
      }
    };

    if (status === 'active' && matchId) {
      initWebRTC();
    }

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub());
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pc) {
        pc.close();
      }
      setIsVoiceConnected(false);
    };
  }, [status, matchId, user]);

  const disqualify = async () => {
    if (!matchId || !user) return;
    try {
      await updateDoc(doc(db, 'arena_matches', matchId), {
        status: 'finished',
        winner: opponent?.uid || 'draw', // Opponent wins if I am disqualified
        disqualified: user.uid
      });
      setGuardianMessage("Zikir dışı konuşma nedeniyle diskalifiye edildiniz.");
    } catch (error) {
      console.error("Error disqualifying:", error);
    }
  };

  const startSearch = async () => {
    if (!user) return;
    playClick();
    setStatus('searching');

    try {
      // 1. Check if there's an available player in the pool within +/- 100 ZGP
      const poolRef = collection(db, 'arena_matchmaking');
      const q = query(poolRef, where('status', '==', 'searching'));
      const snapshot = await getDocs(q);
      
      let matchedDoc = null;
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.uid !== user.uid && Math.abs(data.zgp - zgp) <= 100) {
          matchedDoc = { id: docSnap.id, ...data };
          break;
        }
      }

      if (matchedDoc) {
        // Match found! Create a match room
        const newMatchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Create match document
        await setDoc(doc(db, 'arena_matches', newMatchId), {
          status: 'waiting',
          targetZikir: 'Sübhanallah',
          createdAt: serverTimestamp(),
          players: {
            [user.uid]: { score: 0, status: 'active', username: profile?.username || 'Oyuncu 1', photoURL: profile?.photoURL },
            [matchedDoc.uid]: { score: 0, status: 'active', username: matchedDoc.username || 'Oyuncu 2', photoURL: matchedDoc.photoURL }
          }
        });

        // Update both players in matchmaking pool
        await updateDoc(doc(db, 'arena_matchmaking', matchedDoc.id), {
          status: 'matched',
          matchId: newMatchId
        });

        await setDoc(doc(db, 'arena_matchmaking', user.uid), {
          uid: user.uid,
          zgp,
          username: profile?.username,
          photoURL: profile?.photoURL,
          status: 'matched',
          matchId: newMatchId,
          timestamp: serverTimestamp()
        });

        setMatchId(newMatchId);
        setStatus('matched');
      } else {
        // No match found, join the pool
        await setDoc(doc(db, 'arena_matchmaking', user.uid), {
          uid: user.uid,
          zgp,
          username: profile?.username,
          photoURL: profile?.photoURL,
          status: 'searching',
          timestamp: serverTimestamp()
        });

        // Listen for changes to my matchmaking doc
        const unsub = onSnapshot(doc(db, 'arena_matchmaking', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === 'matched' && data.matchId) {
              setMatchId(data.matchId);
              setStatus('matched');
              unsub();
            }
          }
        });
      }
    } catch (error) {
      console.error("Matchmaking error:", error);
      setStatus('idle');
    }
  };

  const cancelSearch = async () => {
    if (!user) return;
    playClick();
    setStatus('idle');
    try {
      await deleteDoc(doc(db, 'arena_matchmaking', user.uid));
    } catch (error) {
      console.error("Cancel search error:", error);
    }
  };

  // Listen to match document once matched or active
  useEffect(() => {
    if ((status === 'matched' || status === 'active' || status === 'finished') && matchId && user) {
      const unsub = onSnapshot(doc(db, 'arena_matches', matchId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const players = data.players;
          const opponentUid = Object.keys(players).find(id => id !== user.uid);
          
          if (opponentUid) {
            setOpponent(players[opponentUid]);
            setOpponentScore(players[opponentUid].score || 0);
          }
          
          if (players[user.uid]) {
            setMyScore(players[user.uid].score || 0);
          }

          if (data.targetZikir) {
            setTargetZikir(data.targetZikir);
          }
          
          if (data.status === 'active' && status === 'matched') {
            setStatus('active');
            // Set end time if not set locally
            if (data.endTime) {
              const end = typeof data.endTime.toDate === 'function' 
                ? data.endTime.toDate().getTime() 
                : (data.endTime instanceof Date ? data.endTime.getTime() : (typeof data.endTime === 'number' ? data.endTime : Date.now() + 300000));
              const now = Date.now();
              setTimeLeft(Math.max(0, Math.floor((end - now) / 1000)));
            }
          } else if (data.status === 'finished' && status !== 'finished') {
            setStatus('finished');
            let result: 'win' | 'loss' | 'draw' = 'draw';
            if (data.winner === user.uid) result = 'win';
            else if (data.winner === 'draw') result = 'draw';
            else result = 'loss';
            
            setMatchResult(result);
            updateUserStats(result);
          }
        }
      });
      
      // Auto-start match after 3 seconds of matching
      let timer: NodeJS.Timeout;
      if (status === 'matched') {
        timer = setTimeout(() => {
          setStatus('active');
          const endTime = new Date(Date.now() + 5 * 60 * 1000);
          updateDoc(doc(db, 'arena_matches', matchId), { 
            status: 'active',
            endTime: endTime
          }).catch(console.error);
        }, 3000);
      }

      return () => {
        unsub();
        if (timer) clearTimeout(timer);
      };
    }
  }, [status, matchId, user]);

  // Timer countdown
  useEffect(() => {
    if (status === 'active') {
      const interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            finishMatch();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const updateUserStats = async (result: 'win' | 'loss' | 'draw') => {
    if (!user || !profile) return;
    
    let zgpChange = 0;
    if (result === 'win') zgpChange = 25;
    else if (result === 'loss') zgpChange = -15;

    const newZgp = Math.max(0, (profile.stats?.zgp ?? 1000) + zgpChange);
    const newMatchesPlayed = (profile.stats?.arenaMatchesPlayed ?? 0) + 1;
    const newWins = (profile.stats?.arenaWins ?? 0) + (result === 'win' ? 1 : 0);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'stats.zgp': newZgp,
        'stats.arenaMatchesPlayed': newMatchesPlayed,
        'stats.arenaWins': newWins
      });
    } catch (error) {
      console.error("Error updating user stats:", error);
    }
  };

  const finishMatch = async () => {
    if (!matchId || !user) return;
    try {
      // Determine winner locally to update the doc
      // In a real app, a server function should do this to prevent cheating
      const matchDoc = await getDoc(doc(db, 'arena_matches', matchId));
      if (matchDoc.exists() && matchDoc.data().status === 'active') {
        const players = matchDoc.data().players;
        const opponentUid = Object.keys(players).find(id => id !== user.uid);
        
        let winner = 'draw';
        const myFinalScore = players[user.uid].score;
        const oppFinalScore = opponentUid ? players[opponentUid].score : 0;

        if (myFinalScore > oppFinalScore) winner = user.uid;
        else if (oppFinalScore > myFinalScore && opponentUid) winner = opponentUid;

        await updateDoc(doc(db, 'arena_matches', matchId), {
          status: 'finished',
          winner
        });
      }
    } catch (error) {
      console.error("Error finishing match:", error);
    }
  };

  const handleZikirTap = async () => {
    if (status !== 'active' || !matchId || !user) return;
    playClick();
    
    // Optimistic update
    setMyScore(prev => prev + 1);

    try {
      await updateDoc(doc(db, 'arena_matches', matchId), {
        [`players.${user.uid}.score`]: myScore + 1
      });
    } catch (error) {
      console.error("Error updating score:", error);
      // Revert on error
      setMyScore(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-sage-50 dark:bg-neutral-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 border-b border-sage-200 dark:border-white/10 px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { playClick(); onBack(); }}
            className="p-2 rounded-full hover:bg-sage-100 dark:hover:bg-white/10 transition-colors text-sage-800 dark:text-white"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-sage-800 dark:text-white flex items-center gap-2">
              <Target size={20} className="text-purple-500" />
              Zikir Arena
            </h1>
            <p className="text-xs text-sage-500 dark:text-white/60">Canlı 1v1 Zikir Yarışması</p>
          </div>
        </div>
        <div className="bg-purple-100 dark:bg-purple-500/20 px-3 py-1.5 rounded-xl flex items-center gap-2">
          <ShieldAlert size={16} className="text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{zgp} ZGP</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-8"
            >
              <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-xl shadow-purple-500/30">
                <Users size={48} className="text-white" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-sage-800 dark:text-white">Rakip Bul</h2>
                <p className="text-sage-600 dark:text-white/60">
                  Seninle aynı Zikir Güven Puanına (ZGP) sahip bir rakiple eşleş ve 5 dakikalık zikir yarışmasına katıl.
                </p>
              </div>

              <button 
                onClick={startSearch}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-purple-500/30 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Search size={24} />
                Maç Bul
              </button>
            </motion.div>
          )}

          {status === 'searching' && (
            <motion.div 
              key="searching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-8"
            >
              {/* Radar Animation */}
              <div className="relative w-48 h-48 flex items-center justify-center">
                <div className="absolute inset-0 border-2 border-purple-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-4 border-2 border-purple-500/40 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                <div className="absolute inset-8 border-2 border-purple-500/60 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center z-10 shadow-lg shadow-purple-500/50">
                  <Search size={24} className="text-white animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-sage-800 dark:text-white">Rakip Aranıyor...</h2>
                <p className="text-sage-600 dark:text-white/60">
                  Senin seviyende bir oyuncu bulunuyor. Lütfen bekle.
                </p>
              </div>

              <button 
                onClick={cancelSearch}
                className="px-6 py-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors flex items-center gap-2"
              >
                <X size={20} />
                İptal Et
              </button>
            </motion.div>
          )}

          {status === 'matched' && (
            <motion.div 
              key="matched"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-8"
            >
              <div className="text-2xl font-black text-sage-800 dark:text-white">Rakip Bulundu!</div>
              
              <div className="flex items-center justify-center gap-6 w-full">
                <div className="flex flex-col items-center gap-2">
                  <img src={profile?.photoURL} alt="Sen" className="w-20 h-20 rounded-full border-4 border-purple-500 shadow-lg" />
                  <span className="font-bold text-sage-800 dark:text-white">Sen</span>
                </div>
                
                <div className="text-3xl font-black text-purple-500 italic">VS</div>
                
                <div className="flex flex-col items-center gap-2">
                  <img src={opponent?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=opponent`} alt="Rakip" className="w-20 h-20 rounded-full border-4 border-indigo-500 shadow-lg" />
                  <span className="font-bold text-sage-800 dark:text-white">{opponent?.username || 'Rakip'}</span>
                </div>
              </div>

              <div className="text-sage-600 dark:text-white/60 font-medium animate-pulse">
                Maç başlıyor...
              </div>
            </motion.div>
          )}

          {status === 'active' && (
            <motion.div 
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-md flex flex-col items-center space-y-8"
            >
              {/* Timer */}
              <div className="bg-white dark:bg-neutral-800 px-6 py-3 rounded-2xl shadow-sm border border-sage-200 dark:border-white/10 flex items-center gap-3">
                <Clock size={24} className={timeLeft <= 60 ? "text-red-500 animate-pulse" : "text-sage-600 dark:text-white/60"} />
                <span className={`text-3xl font-black tabular-nums ${timeLeft <= 60 ? "text-red-500" : "text-sage-800 dark:text-white"}`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Target Zikir */}
              <div className="text-center space-y-2">
                <p className="text-sm font-bold text-sage-500 dark:text-white/60 uppercase tracking-wider">Hedef Zikir</p>
                <h2 className="text-4xl font-black text-sage-800 dark:text-white">{targetZikir}</h2>
              </div>

              {/* Scoreboard */}
              <div className="w-full grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-3xl p-4 flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-purple-500" />
                  <img src={profile?.photoURL} alt="Sen" className="w-12 h-12 rounded-full mb-2 border-2 border-purple-500" />
                  <span className="text-sm font-bold text-sage-600 dark:text-white/80 mb-1">Sen</span>
                  <span className="text-4xl font-black text-purple-600 dark:text-purple-400">{myScore}</span>
                </div>
                
                <div className="bg-gradient-to-br from-sage-500/10 to-teal-500/10 border border-sage-500/20 rounded-3xl p-4 flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-sage-500" />
                  <img src={opponent?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=opponent`} alt="Rakip" className="w-12 h-12 rounded-full mb-2 border-2 border-sage-500" />
                  <span className="text-sm font-bold text-sage-600 dark:text-white/80 mb-1 truncate w-full">{opponent?.username || 'Rakip'}</span>
                  <span className="text-4xl font-black text-sage-600 dark:text-sage-400">{opponentScore}</span>
                </div>
              </div>

              {/* Zikir Button */}
              <button
                onClick={handleZikirTap}
                className="w-48 h-48 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 shadow-xl shadow-purple-500/30 flex items-center justify-center active:scale-95 transition-all relative group"
              >
                <div className="absolute inset-2 rounded-full border-4 border-white/20 group-active:border-white/40 transition-colors" />
                <span className="text-white font-black text-2xl">Zikir Çek</span>
              </button>

              {/* AI Guardian Warning */}
              <AnimatePresence>
                {guardianMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute bottom-32 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3 z-50"
                  >
                    <ShieldAlert size={24} className="shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">{guardianMessage}</p>
                      <p className="text-xs text-white/80">Uyarı: {warnings}/3</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Voice Chat Status */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                isVoiceConnected 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' 
                  : 'bg-white dark:bg-neutral-800 text-sage-500 dark:text-white/60 border-sage-200 dark:border-white/10'
              }`}>
                <Mic size={16} className={isVoiceConnected ? 'animate-pulse' : ''} />
                <span className="text-sm font-medium">
                  {isVoiceConnected ? 'Sesli Sohbet Aktif' : 'Sesli Sohbet Bağlanıyor...'}
                </span>
              </div>
            </motion.div>
          )}

          {status === 'finished' && (
            <motion.div 
              key="finished"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md flex flex-col items-center text-center space-y-8"
            >
              <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-xl ${
                matchResult === 'win' ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/30' :
                matchResult === 'loss' ? 'bg-gradient-to-br from-red-400 to-rose-500 shadow-red-500/30' :
                'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30'
              }`}>
                <Trophy size={48} className="text-white" />
              </div>

              <div className="space-y-2">
                <h2 className="text-4xl font-black text-sage-800 dark:text-white">
                  {matchResult === 'win' ? 'Kazandın!' : matchResult === 'loss' ? 'Kaybettin' : 'Berabere'}
                </h2>
                <p className="text-sage-600 dark:text-white/60 text-lg">
                  {matchResult === 'win' ? '+25 ZGP Kazandın' : matchResult === 'loss' ? '-15 ZGP Kaybettin' : 'ZGP Değişmedi'}
                </p>
              </div>

              <div className="w-full bg-white dark:bg-neutral-800 rounded-3xl p-6 border border-sage-200 dark:border-white/10 flex justify-between items-center">
                <div className="text-center flex-1">
                  <p className="text-sm font-bold text-sage-500 dark:text-white/60 mb-1">Sen</p>
                  <p className="text-3xl font-black text-purple-600 dark:text-purple-400">{myScore}</p>
                </div>
                <div className="w-px h-12 bg-sage-200 dark:bg-white/10" />
                <div className="text-center flex-1">
                  <p className="text-sm font-bold text-sage-500 dark:text-white/60 mb-1 truncate px-2">{opponent?.username || 'Rakip'}</p>
                  <p className="text-3xl font-black text-sage-600 dark:text-sage-400">{opponentScore}</p>
                </div>
              </div>

              <button 
                onClick={() => {
                  playClick();
                  setStatus('idle');
                  setMatchId(null);
                  setOpponent(null);
                  setMyScore(0);
                  setOpponentScore(0);
                  setTimeLeft(300);
                  setMatchResult(null);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-purple-500/30 transition-all active:scale-95"
              >
                Yeni Maç Bul
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
