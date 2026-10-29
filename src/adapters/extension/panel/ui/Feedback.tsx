export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="ui-spinner" role="status" aria-label={label} />;
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
