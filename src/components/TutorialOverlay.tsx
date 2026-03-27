import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Check, BookOpen, Users, Trophy, RotateCcw, ListTodo, Home, Fingerprint, Bell, Bot } from 'lucide-react';

interface TutorialOverlayProps {
  onClose: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: "HatimPro'ya Hoş Geldiniz!",
    icon: <Home size={48} className="text-emerald-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>HatimPro, bireysel ve toplu ibadetlerinizi düzenli bir şekilde takip etmenizi sağlayan kapsamlı bir platformdur.</p>
        <p>Bu rehberde uygulamanın temel özelliklerini ve nasıl kullanacağınızı öğreneceksiniz.</p>
        <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700 mt-4">
          <p className="text-xs text-neutral-400">💡 <strong>İpucu:</strong> Bu eğitime daha sonra sağ üst köşedeki soru işareti (?) ikonuna tıklayarak tekrar ulaşabilirsiniz.</p>
        </div>
      </div>
    )
  },
  {
    title: "Okuma Takibi ve Görevler",
    icon: <ListTodo size={48} className="text-blue-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p><strong>Görevler</strong> sekmesinden kendinize özel okuma hedefleri belirleyebilirsiniz.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Okumaya Başla:</strong> Bugünün kaydını yapmak için bu butonu kullanın. Zamanlayıcı başlar ve okuma bittiğinde manevi taahhüt ile kaydedilir.</li>
          <li><strong>Manuel Kayıt (+):</strong> Yanındaki <strong className="text-white">+</strong> butonu ile <strong>bugün veya geçmiş günler</strong> için manuel olarak sayfa kaydı girebilirsiniz.</li>
          <li><strong>İlerleme:</strong> Görevlerinizi tamamladıkça XP kazanır ve seviye atlarsınız.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Hatim Odaları",
    icon: <BookOpen size={48} className="text-purple-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>Sevdiklerinizle birlikte ortak hatimler yapın.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Oda Kurma:</strong> Yeni bir hatim odası açın ve oda kodunu arkadaşlarınızla paylaşın.</li>
          <li><strong>Cüz Seçimi:</strong> Odadaki boş cüzlerden dilediğinizi üzerinize alabilirsiniz.</li>
          <li><strong>Sayfa Takibi:</strong> Aldığınız cüzün üzerine tıklayarak o cüzde kaçıncı sayfada olduğunuzu güncelleyebilirsiniz.</li>
          <li><strong>Tamamlama:</strong> Tüm cüzler bittiğinde hatim duası için bildirim alırsınız.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Zikir Odaları",
    icon: <RotateCcw size={48} className="text-amber-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>Gerçek zamanlı zikir odalarında toplu zikir çekin.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Canlı Katılım:</strong> Bir odaya girdiğinizde diğer kullanıcıların çektiği zikirleri anlık olarak görebilirsiniz.</li>
          <li><strong>Zikir Çekme:</strong> Ekrana dokunarak zikrinizi çekin; her dokunuşunuz tüm katılımcıların ekranında senkronize olur.</li>
          <li><strong>Hedef:</strong> Belirlenen hedefe ulaşıldığında oda otomatik olarak tamamlanır.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Profil ve Sosyal Özellikler",
    icon: <Trophy size={48} className="text-yellow-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>Gelişiminizi takip edin ve arkadaşlarınızla etkileşime geçin.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Profil:</strong> Kendi profilinizden toplam XP, seviye ve okuma istatistiklerinizi görebilirsiniz.</li>
          <li><strong>Takipleşme:</strong> Diğer kullanıcıları arayıp takip ederek onların ilerlemelerini görebilirsiniz.</li>
          <li><strong>Liderlik Tablosu:</strong> "Diğer" menüsü altındaki sıralama kısmından topluluktaki yerinizi görün.</li>
          <li><strong>Seri (Streak):</strong> Her gün okuma yaparak serinizi bozmadan devam ettirin.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Bildirimler ve Hatırlatmalar",
    icon: <Bell size={48} className="text-red-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>İbadetlerinizi aksatmamak için akıllı bildirimleri kullanın.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Hatırlatmalar:</strong> Günlük okuma hedeflerinizi tamamlamadığınızda sistem size nazik hatırlatmalar gönderir.</li>
          <li><strong>Oda Duyuruları:</strong> Katıldığınız hatim odalarında cüzler bittiğinde veya yeni bir gelişme olduğunda anında haberdar olursunuz.</li>
          <li><strong>İzin Verme:</strong> Uygulama açılışında çıkan Türkçe izin penceresinden "İzin Ver" diyerek bu özelliği aktif edebilirsiniz.</li>
          <li><strong>Ayarlar:</strong> İstediğiniz zaman Ayarlar menüsünden bildirim durumunuzu kontrol edebilirsiniz.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Güvenlik ve Biyometrik Giriş",
    icon: <Fingerprint size={48} className="text-sage-600" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>Hesabınızı güvende tutmak için modern güvenlik yöntemlerini kullanın.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Biyometrik Giriş (Passkey):</strong> Ayarlar menüsünden cihazınızın parmak izi veya yüz tanıma özelliğini ekleyerek şifresiz ve güvenli giriş yapabilirsiniz.</li>
          <li><strong>İki Faktörlü Doğrulama (2FA):</strong> Hesabınızı ek bir güvenlik katmanıyla koruyun.</li>
          <li><strong>Hesap Bağlantıları:</strong> Google, GitHub veya Microsoft hesaplarınızı bağlayarak tek tıkla giriş yapabilirsiniz.</li>
        </ul>
      </div>
    )
  },
  {
    title: "Yapay Zeka Asistanı",
    icon: <Bot size={48} className="text-teal-500" />,
    content: (
      <div className="space-y-4 text-left text-sm text-neutral-300">
        <p>Dini konularda sorularınızı sorabileceğiniz akıllı asistanınız.</p>
        <ul className="list-disc pl-5 space-y-2 text-neutral-400">
          <li><strong>Dini Rehberlik:</strong> Sadece dini konularda güvenilir cevaplar üretmek üzere tasarlanmış özel yapay zeka asistanı.</li>
          <li><strong>Soru-Cevap:</strong> Aklınıza takılan dini soruları sorabilir, ayet ve hadisler ışığında bilgi alabilirsiniz.</li>
          <li><strong>Hızlı Erişim:</strong> "Diğer" menüsünden asistana kolayca ulaşabilirsiniz.</li>
        </ul>
      </div>
    )
  }
];

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-md relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors z-20"
        >
          <X size={20} />
        </button>

        <div className="flex-1 overflow-y-auto pr-2 mt-4">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center shadow-inner border border-neutral-700">
              {TUTORIAL_STEPS[currentStep].icon}
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-6 text-center">{TUTORIAL_STEPS[currentStep].title}</h2>
          
          {TUTORIAL_STEPS[currentStep].content}
        </div>

        <div className="mt-8 pt-4 border-t border-neutral-800 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-1.5">
              {TUTORIAL_STEPS.map((_, idx) => (
                <div 
                  key={idx} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep ? 'w-8 bg-emerald-500' : 'w-2 bg-neutral-700'}`}
                />
              ))}
            </div>
            <span className="text-xs font-bold text-neutral-500">{currentStep + 1} / {TUTORIAL_STEPS.length}</span>
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button 
                onClick={handlePrev}
                className="px-4 py-3 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center justify-center"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <button 
              onClick={handleNext}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
            >
              {currentStep === TUTORIAL_STEPS.length - 1 ? (
                <>Uygulamaya Başla <Check size={18} /></>
              ) : (
                <>Sonraki Adım <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
