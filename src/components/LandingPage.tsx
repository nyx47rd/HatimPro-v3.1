import React, { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, BookOpen, Activity, Calendar, Bot, Users } from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
  onGuestClick: () => void;
  onPrivacyClick: () => void;
  onTermsClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onGuestClick, onPrivacyClick, onTermsClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -40]);

  const features = [
    { icon: Users,    title: "Hatim Odaları",       desc: "Toplulukla birlikte cüz paylaşarak hatim indirin." },
    { icon: Activity, title: "Zikirmatik",           desc: "Hedef belirle, takip et, istatistiklerini gör." },
    { icon: Calendar, title: "Namaz Takibi",         desc: "Kılınan ve kaza namazları düzenli kaydet." },
    { icon: Bot,      title: "AI Asistanı",          desc: "Dini sorulara güvenilir, kaynaklı cevaplar." },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-neutral-950 text-white font-sans overflow-x-hidden">

      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
      />

      {/* Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse at top, rgba(20,184,110,0.12) 0%, transparent 70%)' }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.06] bg-neutral-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <BookOpen size={13} className="text-neutral-950" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">HatimPro</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onGuestClick}
              className="text-xs font-medium text-neutral-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-all"
            >
              Misafir girişi
            </button>
            <button
              onClick={onLoginClick}
              className="text-xs font-semibold bg-white text-neutral-950 px-4 py-2 rounded-lg hover:bg-neutral-100 transition-all"
            >
              Giriş yap
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-40 pb-32">
          <motion.div style={{ y: heroY }}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Dijital İbadet Asistanı</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-[clamp(40px,7vw,88px)] font-bold tracking-[-0.04em] leading-[0.95] text-white mb-6 max-w-4xl"
            >
              Kur'an ile bağınızı<br />
              <span className="text-emerald-400">güçlendirin.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base text-neutral-400 max-w-lg leading-relaxed mb-10"
            >
              Hatim takibi, zikirmatik, namaz vakitleri ve yapay zeka destekli
              İslami asistan ile manevi yolculuğunuzda yanınızdayız.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-3"
            >
              <button
                onClick={onLoginClick}
                className="group inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-200"
              >
                Hemen başla
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={onGuestClick}
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white px-5 py-2.5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-200"
              >
                Uygulamayı keşfet
              </button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex gap-8 mt-16 pt-8 border-t border-white/[0.06]"
            >
              {[
                { num: "12K+", label: "Aktif kullanıcı" },
                { num: "340+", label: "Tamamlanan hatim" },
                { num: "%100", label: "Ücretsiz" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-xl font-bold text-white tabular-nums">{s.num}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </section>

        {/* Feature grid */}
        <section className="max-w-6xl mx-auto px-6 pb-32">
          <div className="border border-white/[0.06] rounded-2xl overflow-hidden bg-neutral-900/40 backdrop-blur-sm">

            {/* Header row */}
            <div className="px-8 py-6 border-b border-white/[0.06]">
              <p className="text-xs font-medium tracking-widest uppercase text-neutral-500 mb-1">Özellikler</p>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                Tek uygulamada her şey.
              </h2>
            </div>

            {/* 2x2 grid */}
            <div className="grid grid-cols-1 md:grid-cols-2">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className={`
                    p-8 group cursor-default
                    hover:bg-white/[0.02] transition-colors duration-300
                    ${i % 2 === 0 && i < features.length - 1 ? 'md:border-r border-white/[0.06]' : ''}
                    ${i < 2 ? 'border-b border-white/[0.06]' : ''}
                  `}
                >
                  <div className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center mb-5 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/5 transition-all duration-300">
                    <f.icon size={17} className="text-neutral-400 group-hover:text-emerald-400 transition-colors duration-300" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-6xl mx-auto px-6 pb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-neutral-900/60 px-10 py-16 text-center"
          >
            {/* inner glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 60%)' }}
            />
            <p className="text-xs font-medium tracking-widest uppercase text-emerald-500 mb-4 relative z-10">
              Ücretsiz, her zaman
            </p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] text-white mb-4 relative z-10">
              Manevi yolculuğunuza<br />bugün başlayın.
            </h2>
            <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-8 leading-relaxed relative z-10">
              Hesap oluşturun, tüm özelliklerden yararlanın. Verileriniz güvenle saklanır ve cihazlar arasında senkronize edilir.
            </p>
            <button
              onClick={onLoginClick}
              className="group inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-sm px-6 py-3 rounded-xl transition-all relative z-10"
            >
              Ücretsiz kayıt ol
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>
        </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500/20 flex items-center justify-center">
              <BookOpen size={10} className="text-emerald-400" strokeWidth={2.5} />
            </div>
            <span className="text-xs font-medium text-neutral-500">HatimPro</span>
          </div>
          <p className="text-xs text-neutral-600">© {new Date().getFullYear()} HatimPro</p>
          <div className="flex gap-5">
            <a href="#" onClick={(e) => { e.preventDefault(); onPrivacyClick(); }} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Gizlilik</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onTermsClick(); }} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Koşullar</a>
          </div>
        </div>
      </footer>

    </div>
  );
};