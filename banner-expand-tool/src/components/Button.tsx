import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
        size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-600/50",
        variant === "secondary" &&
          "border border-white/15 bg-white/5 text-zinc-50 hover:bg-white/10 disabled:opacity-50",
        variant === "ghost" &&
          "text-zinc-200 hover:bg-white/10 disabled:opacity-50",
        disabled && "cursor-not-allowed",
        className
      )}
    />
  );
}

