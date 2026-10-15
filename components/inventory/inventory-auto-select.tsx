"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type SelectOption = {
  label: string;
  value: string;
};

type InventoryAutoSelectProps = {
  ariaLabel: string;
  className: string;
  name: string;
  options: SelectOption[];
  value: string;
};

export function InventoryAutoSelect({ ariaLabel, className, name, options, value }: InventoryAutoSelectProps) {
  const [selectedValue, setSelectedValue] = useState(value);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  function changeValue(nextValue: string) {
    setSelectedValue(nextValue);
    setIsLoading(true);
    const params = new URLSearchParams(window.location.search);
    params.set(name, nextValue);
    window.requestAnimationFrame(() => window.location.assign(`${window.location.pathname}?${params.toString()}`));
  }

  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        className={`${className} ${isLoading ? "opacity-70" : ""}`}
        disabled={isLoading}
        name={name}
        onChange={(event) => changeValue(event.target.value)}
        value={selectedValue}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {isLoading ? <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" /> : null}
    </div>
  );
}
