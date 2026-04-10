import { AVATAR_OPTIONS, type AvatarSlug } from "../lib/avatarOptions";

type Props = {
  value: AvatarSlug | null;
  onChange: (slug: AvatarSlug | null) => void;
  idPrefix: string;
  disabled?: boolean;
};

/**
 * Selector accesible: radiogroup + teclado (flechas) en cada opción vía roving tabindex pattern simplificado (nativo radio).
 */
export function AvatarGlyphPicker({ value, onChange, idPrefix, disabled }: Props) {
  const groupName = `${idPrefix}-avatar-slug`;

  return (
    <fieldset className="auth-avatar-fieldset" disabled={disabled}>
      <legend className="auth-avatar-legend">Tu seña en la app</legend>
      <p className="auth-avatar-hint" id={`${idPrefix}-avatar-hint`}>
        Elegí un símbolo abstracto (geometría, ciencia o tipografía). Es opcional; si no elegís, verás la inicial de tu email. No
        sube archivos ni fotos.
      </p>
      <div className="auth-avatar-grid" role="radiogroup" aria-describedby={`${idPrefix}-avatar-hint`}>
        <label className="auth-avatar-option auth-avatar-option--none">
          <input
            type="radio"
            name={groupName}
            checked={value === null}
            onChange={() => onChange(null)}
            disabled={disabled}
          />
          <span className="auth-avatar-tile" aria-hidden>
            <span className="auth-avatar-none-mark">—</span>
          </span>
          <span className="auth-avatar-label">Ninguno</span>
        </label>
        {AVATAR_OPTIONS.map((opt) => (
          <label key={opt.slug} className="auth-avatar-option">
            <input
              type="radio"
              name={groupName}
              value={opt.slug}
              checked={value === opt.slug}
              onChange={() => onChange(opt.slug)}
              disabled={disabled}
            />
            <span className="auth-avatar-tile" title={opt.label} aria-hidden>
              {opt.char}
            </span>
            <span className="sr-only">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
