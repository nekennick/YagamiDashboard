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
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: "blur(4px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay }}
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
          transition: reduceMotion ? {} : { staggerChildren: 0.07, delayChildren: 0.05 }
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
        hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.985, filter: "blur(3px)" },
        show: reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }
      }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedPanel({ children, className, delay = 0 }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      className={cn("will-change-transform", className)}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.988, filter: "blur(4px)" }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedTableRow({ children, className, delay = 0 }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.tr
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: "blur(2px)" }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.tr>
  );
}

export function MotionMetricGrid({ children, className }: MotionContainerProps) {
  return <StaggerContainer className={cn("grid gap-4", className)}>{children}</StaggerContainer>;
}

export function MotionMetricCard({ children, className }: MotionContainerProps) {
  return (
    <StaggerItem>
      <div className={className}>{children}</div>
    </StaggerItem>
  );
}
