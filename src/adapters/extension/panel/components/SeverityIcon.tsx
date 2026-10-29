import type { Severity } from '../../../../inference/types';
import { AlertIcon, InfoIcon, SparkleIcon } from '../ui';

const ICONS = { high: AlertIcon, medium: SparkleIcon, low: InfoIcon };

/** Round leading visual for an opportunity, tinted by severity. */
export function SeverityIcon({ severity }: { severity: Severity }) {
  const Icon = ICONS[severity];
  return (
    <span className={`severity-icon severity-icon--${severity}`} aria-label={`${severity} severity`}>
      <Icon size={14} />
    </span>
  );
}
