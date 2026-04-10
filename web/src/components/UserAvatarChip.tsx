import { avatarCharForSlug, emailInitial } from "../lib/avatarOptions";

type Props = {
  email: string | null | undefined;
  avatarSlug: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Avatar compacto: símbolo elegido o inicial del email (accesible).
 */
export function UserAvatarChip({ email, avatarSlug, size = "md", className = "" }: Props) {
  const glyph = avatarCharForSlug(avatarSlug);
  const initial = emailInitial(email);
  const label = `Cuenta ${email ?? ""}`.trim();

  return (
    <span
      className={`app-user-avatar app-user-avatar--${size} ${className}`.trim()}
      role="img"
      aria-label={label}
    >
      <span className="app-user-avatar__inner" aria-hidden>
        {glyph ?? initial}
      </span>
    </span>
  );
}
