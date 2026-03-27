import React from 'react';
import { motion } from 'motion/react';

interface LiquidGlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  intensity?: 'light' | 'medium' | 'heavy';
}

export const LiquidGlassButton: React.FC<LiquidGlassButtonProps> = ({ 
  children, 
  className = '', 
  intensity = 'medium',
  ...props 
}) => {
  const intensityClasses = {
    light: 'border-white/10 hover:border-white/20',
    medium: 'border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:border-white/20',
    heavy: 'border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] hover:border-white/20'
  };

  const overlayClasses = {
    light: 'bg-neutral-900/40 backdrop-blur-md',
    medium: 'bg-neutral-900/60 backdrop-blur-lg',
    heavy: 'bg-neutral-900/80 backdrop-blur-xl'
  };

  // Filter out props that conflict with motion.button
  const { onDrag, onDragStart, onDragEnd, onAnimationStart, ...buttonProps } = props as any;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        group relative overflow-hidden rounded-2xl border
        ${intensityClasses[intensity]}
        transition-all duration-500
        isolate
        ${className}
      `}
      style={{
        // Safari fix for overflow-hidden not clipping blurred/transformed children
        WebkitMaskImage: '-webkit-radial-gradient(white, black)'
      }}
      {...buttonProps}
    >
      {/* 1. Base Glass overlay (provides the dark background and blurs whatever is behind the button) */}
      <div className={`absolute inset-0 rounded-2xl ${overlayClasses[intensity]} transition-colors duration-500 group-hover:bg-neutral-900/50 z-0 pointer-events-none`} />

      {/* 2. Aurora Background Effect (rendered ON TOP of the dark glass, so it's clearly visible even when not hovered) */}
      <div className="absolute inset-0 opacity-50 group-hover:opacity-100 transition-opacity duration-700 overflow-hidden rounded-2xl mix-blend-screen z-0 pointer-events-none">
        <div className="absolute -inset-[100%] animate-spin-slow">
          <div className="absolute top-[15%] left-[15%] w-[45%] h-[45%] bg-emerald-500 rounded-full blur-[40px]" />
          <div className="absolute top-[15%] right-[15%] w-[45%] h-[45%] bg-blue-500 rounded-full blur-[40px]" />
          <div className="absolute bottom-[15%] left-[25%] w-[45%] h-[45%] bg-purple-500 rounded-full blur-[40px]" />
        </div>
      </div>

      {/* 3. Shimmer effect (seamless ping-pong) */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-2xl z-0 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center gap-2 w-full h-full text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        {children}
      </div>
    </motion.button>
  );
};
