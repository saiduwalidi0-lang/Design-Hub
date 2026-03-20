import { cn } from "@/lib/utils";

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  helperText?: string;
  errorText?: string;
};

export default function TextField({ label, helperText, errorText, className, ...rest }: TextFieldProps) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-200">{label}</div>
      <input
        {...rest}
        className={cn(
          "h-10 w-full rounded-md border bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition",
          errorText ? "border-red-500/50 focus:border-red-400" : "border-white/15 focus:border-indigo-500/60",
          className
        )}
      />
      {errorText ? (
        <div className="mt-1 text-xs text-red-300">{errorText}</div>
      ) : helperText ? (
        <div className="mt-1 text-xs text-zinc-400">{helperText}</div>
      ) : null}
    </label>
  );
}

