import { useId } from 'react';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'email' | 'url';
  multiline?: boolean;
}

/** Label above a bordered field, as in the reference forms. */
export function TextField({ label, value, onChange, placeholder, hint, type = 'text', multiline }: TextFieldProps) {
  const id = useId();
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="ui-field__input ui-field__input--multiline" value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="ui-field__input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="ui-field__hint">{hint}</span>}
    </div>
  );
}
