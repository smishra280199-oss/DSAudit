import { SearchIcon } from './icons';

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
}

export function Search({ value, onChange, placeholder = 'Search…', label }: SearchProps) {
  return (
    <label className="ui-search">
      <span className="visually-hidden">{label}</span>
      <SearchIcon size={14} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
