import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-10 px-4",
        size === "sm" && "h-8 px-3 text-xs",
        size === "icon" && "h-9 w-9 p-0",
        variant === "default" && "bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
        variant === "outline" && "border border-slate-200 bg-transparent text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800",
        variant === "ghost" && "bg-transparent text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800",
        className
      )}
      {...props}
    />
  );
}
