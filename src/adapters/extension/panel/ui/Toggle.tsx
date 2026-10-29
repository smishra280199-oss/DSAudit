interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Tactile switch: a glossy knob in an inset track that turns green when on. */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="ui-toggle">
      <input
        className="ui-toggle__input"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__knob" />
      </span>
      <span className="ui-toggle__text">
        <span className="ui-toggle__label">{label}</span>
        {description && <span className="ui-toggle__description">{description}</span>}
      </span>
    </label>
  );
}
