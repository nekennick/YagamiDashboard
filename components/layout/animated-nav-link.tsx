"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

type AnimatedNavLinkProps = {
  children: React.ReactNode;
  href: string;
};

export function AnimatedNavLink({ children, href }: AnimatedNavLinkProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileHover={reduceMotion ? undefined : { x: 2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
    >
      <Link
        href={href}
        className="flex min-w-max items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        {children}
      </Link>
    </motion.div>
  );
}
