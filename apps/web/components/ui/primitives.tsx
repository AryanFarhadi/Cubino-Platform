import clsx from "clsx";
import { resolveUserAvatarUrl } from "@/lib/user-assets";

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "gold";
}) {
  return (
    <button
      className={clsx(
        "paw-ripple rounded-den px-4 py-2.5 text-sm font-semibold transition-all duration-150",
        variant === "primary" &&
          "bg-den-honey text-white hover:bg-den-amber shadow-sm hover:shadow-glow",
        variant === "gold" &&
          "bg-den-gold text-den-darker hover:bg-den-mane shadow-sm hover:shadow-glow-gold",
        variant === "ghost" &&
          "bg-transparent text-den-cream hover:bg-den-elevated border border-white/[0.08]",
        variant === "danger" &&
          "bg-den-berry text-white hover:bg-red-600",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-den border border-black/20 bg-[#1e1f22] px-3 py-2.5 text-den-cream outline-none transition-colors",
        "placeholder:text-den-muted focus:border-den-honey focus:ring-1 focus:ring-den-honey/40",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "owner" | "default" | "muted";
  className?: string;
}) {
  const styles = {
    owner: "bg-den-gold/15 text-den-gold border-den-gold/40",
    default: "bg-den-honey/15 text-den-honey border-den-honey/30",
    muted: "bg-den-elevated text-den-muted border-white/10",
  };
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  speaking,
  status,
  unread,
}: {
  name: string;
  src?: string | null;
  size?: number;
  speaking?: boolean;
  status?: "online" | "idle" | "dnd" | "offline";
  unread?: number;
}) {
  const statusColor = {
    online: "bg-den-forest",
    idle: "bg-den-gold",
    dnd: "bg-den-berry",
    offline: "bg-den-muted",
  };
  const resolvedSrc = resolveUserAvatarUrl(src);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={clsx(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-den-honey/20 font-bold text-den-gold",
          speaking && "ring-2 ring-den-forest ring-offset-2 ring-offset-den-deep"
        )}
        title={name}
      >
        {resolvedSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolvedSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </div>
      {unread !== undefined && unread > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold leading-none text-white"
          aria-label={`${unread} unread`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {status && (
        <span
          className={clsx(
            "absolute bottom-0 right-0 rounded-full border-[3px] border-den-surface",
            statusColor[status]
          )}
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </div>
  );
}
