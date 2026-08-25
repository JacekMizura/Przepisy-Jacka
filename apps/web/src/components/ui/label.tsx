import type { LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-gray-700", className)}
      {...props}
    >
      {children}
    </label>
  );
}
