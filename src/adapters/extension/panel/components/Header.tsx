import { hostOf, relativeTime } from '../../../../report/format';
import { Avatar, Button, DownloadIcon, CopyIcon, GlobeIcon, IconButton, Menu, MoreIcon, RefreshIcon, SettingsIcon, Spinner, Tooltip } from '../ui';
import { copyMarkdown, exportHtml, exportJson } from '../export';
import { useAuditState, useController } from '../use-audit';
import { useNavigation, VIEW_TITLES } from '../navigation';

/** Sticky header: view title over the page being audited, with the capture button and the panel menu. */
export function Header() {
  const controller = useController();
  const { tab, audit, status, capturability, hostAccess } = useAuditState();
  const { view, openSettings } = useNavigation();

  const subtitle = audit
    ? `${hostOf(audit.snapshot.url)} · Captured ${relativeTime(audit.snapshot.capturedAt).toLowerCase()}`
    : tab?.url
      ? hostOf(tab.url)
      : 'No page';
  const capturing = status === 'capturing';

  return (
    <header className="panel-header">
      <Avatar src={tab?.favIconUrl} label={tab?.title ?? 'S'} />
      <div className="panel-header__titles">
        <h1 className="panel-header__title">{VIEW_TITLES[view]}</h1>
        <p className="panel-header__subtitle">{subtitle}</p>
      </div>
      <Tooltip content={audit ? 'Capture again' : 'Capture page'} shortcut={['C']}>
        <Button
          variant="primary"
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
        sections={[
          {
            label: 'Export',
            items: audit
              ? [
                  { label: 'HTML report', icon: <DownloadIcon />, onSelect: () => exportHtml(audit) },
                  { label: 'JSON data', icon: <DownloadIcon />, onSelect: () => exportJson(audit) },
                  {
                    label: 'Copy summary (Markdown)',
                    icon: <CopyIcon />,
                    onSelect: () =>
                      void copyMarkdown(audit).then((ok) => controller.notify(ok ? 'Summary copied.' : 'Couldn’t copy to the clipboard.')),
                  },
                ]
              : [],
          },
          {
            label: 'Settings',
            items: [
              { label: 'Savings assumptions…', icon: <SettingsIcon />, onSelect: openSettings },
              ...(hostAccess
                ? []
                : [{ label: 'Allow access to all sites', icon: <GlobeIcon />, onSelect: () => void controller.requestHostAccess() }]),
            ],
          },
        ].filter((section) => section.items.length > 0)}
      />
    </header>
  );
}
