"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type MotionContainerProps = {
  children: React.ReactNode;
  className?: string;
};

type FadeInProps = MotionContainerProps & {
  delay?: number;
};

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({ children, className }: MotionContainerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate="show"
      className={className}
      initial="hidden"
      variants={{
        hidden: {},
        show: {
          transition: reduceMotion ? {} : { staggerChildren: 0.055, delayChildren: 0.04 }
        }
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: MotionContainerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 },
        show: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
      }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedPanel({ children, className, delay = 0 }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className={cn("will-change-transform", className)}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      transition={{ duration: 0.32, ease: "easeOut", delay }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedTableRow({ children, className, delay = 0 }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.tr
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
    >
      {children}
    </motion.tr>
  );
}
