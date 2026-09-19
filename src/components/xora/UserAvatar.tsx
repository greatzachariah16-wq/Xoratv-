import { useSignedUrl } from "@/lib/media";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  path?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  size?: number | undefined;
};

export function UserAvatar({ path, name, className, size = 40 }: Props) {
  const isRemote = Boolean(path && /^https?:\/\//.test(path));
  const signed = useSignedUrl("avatars", isRemote ? null : path);
  const src = isRemote ? path : signed;

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-[0.7rem] font-semibold text-muted-foreground ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={name ? `${name}'s avatar` : "User avatar"}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
