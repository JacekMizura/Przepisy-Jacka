import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-emerald-600 text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        outline:
          "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        amber:
          "bg-amber-500 text-white shadow-sm shadow-amber-200 hover:bg-amber-600",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
