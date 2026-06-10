"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type AnimatedNavLinkProps = {
  children: React.ReactNode;
  href: string;
};

export function AnimatedNavLink({ children, href }: AnimatedNavLinkProps) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <motion.div
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileHover={reduceMotion ? undefined : { x: 2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
    >
      <Link
        href={href}
        className={cn(
          "flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-indigo-50 text-indigo-600 shadow-sm dark:bg-indigo-500/15 dark:text-indigo-400"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
        )}
      >
        {children}
      </Link>
    </motion.div>
  );
}
