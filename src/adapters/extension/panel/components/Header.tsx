import { hostOf, relativeTime } from '../../../../report/format';
import {
  Avatar,
  Button,
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  IconButton,
  Menu,
  MoreIcon,
  RefreshIcon,
  SettingsIcon,
  Spinner,
  Tooltip,
  UserIcon,
  type MenuSection,
} from '../ui';
import { useNavigation, VIEW_TITLES } from '../navigation';
import { useAuditState, useController } from '../use-audit';
import { useReports } from '../use-reports';

/** Sticky header: view title over the page being audited, with the capture button and the panel menu. */
export function Header() {
  const controller = useController();
  const { tab, audit, status, capturability, hostAccess } = useAuditState();
  const { view, openSettings, openReportDetails } = useNavigation();
  const reports = useReports();

  const subtitle = audit
    ? `${hostOf(audit.snapshot.url)} · Captured ${relativeTime(audit.snapshot.capturedAt).toLowerCase()}`
    : tab?.url
      ? hostOf(tab.url)
      : 'No page';
  const capturing = status === 'capturing';

  const sections: MenuSection[] = [
    ...(audit
      ? [
          {
            label: 'Client report',
            items: [
              { label: 'Download PDF report', icon: <DownloadIcon />, onSelect: () => void reports.downloadPdf(audit) },
              { label: 'Download web report (HTML)', icon: <DownloadIcon />, onSelect: () => reports.downloadHtml(audit) },
              { label: 'Copy summary (Markdown)', icon: <CopyIcon />, onSelect: () => reports.copySummary(audit) },
              { label: 'Download raw data (JSON)', icon: <DownloadIcon />, onSelect: () => reports.downloadJson(audit) },
            ],
          },
        ]
      : []),
    {
      label: 'Settings',
      items: [
        { label: 'Report details…', icon: <UserIcon />, onSelect: openReportDetails },
        { label: 'Savings assumptions…', icon: <SettingsIcon />, onSelect: openSettings },
        ...(hostAccess ? [] : [{ label: 'Allow access to all sites', icon: <GlobeIcon />, onSelect: () => void controller.requestHostAccess() }]),
      ],
    },
  ];

  return (
    <header className="panel-header">
      <Avatar src={tab?.favIconUrl} label={tab?.title || 'S'} />
      <div className="panel-header__titles">
        <h1 className="panel-header__title">{VIEW_TITLES[view]}</h1>
        <p className="panel-header__subtitle">{subtitle}</p>
      </div>
      <Tooltip content={audit ? 'Capture again' : 'Capture page'} shortcut={['C']}>
        <Button
          variant={audit ? 'secondary' : 'primary'}
          size="sm"
          disabled={capturability !== 'ok' || capturing}
          onClick={() => void controller.capture()}
          icon={capturing ? <Spinner label="Capturing" /> : audit ? <RefreshIcon size={14} /> : undefined}
        >
          {capturing ? 'Capturing' : audit ? 'Recapture' : 'Capture page'}
        </Button>
      </Tooltip>
      <Menu
        label="Panel menu"
        trigger={({ onClick, expanded }) => (
          <IconButton label="Panel menu" aria-haspopup="menu" aria-expanded={expanded} onClick={onClick} outlined>
            <MoreIcon />
          </IconButton>
        )}
        sections={sections}
      />
    </header>
  );
}
