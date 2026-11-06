/**
 * One finding as a shareable image (1200×675, the size LinkedIn and email
 * previews show well): the problem in a sentence, the real elements side by
 * side, and who it's from. Pasted into a message body it gets seen; an
 * attachment from a stranger often doesn't get opened.
 */

import type { HealthFinding, HealthReport } from '../../../insights/health';
import { bookingHref, displayUrl, type ReportBranding } from '../../../report/branding';

const W = 1200;
const H = 675;
const PAD = 56;
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function findingCard(report: HealthReport, finding: HealthFinding, branding: ReportBranding): Promise<Blob> {
  const canvas = Object.assign(document.createElement('canvas'), { width: W * 2, height: H * 2 });
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header: who it's from, who it's about.
  ctx.fillStyle = '#6b6b6b';
  ctx.font = `600 18px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(branding.agencyName || 'Design system health check', PAD, PAD - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`${report.clientName} · ${report.overall.score}/100`, W - PAD, PAD - 8);
  ctx.textAlign = 'left';

  // The finding, in their words.
  ctx.fillStyle = '#171717';
  ctx.font = `700 44px ${FONT}`;
  const title = wrap(ctx, finding.point.title, W - PAD * 2, 2);
  title.forEach((line, i) => ctx.fillText(line, PAD, PAD + 32 + i * 54));
  let y = PAD + 32 + title.length * 54 + 6;
  ctx.fillStyle = '#6b6b6b';
  ctx.font = `400 22px ${FONT}`;
  const sub = wrap(ctx, finding.details[0] ?? finding.point.summary, W - PAD * 2, 2);
  sub.forEach((line, i) => ctx.fillText(line, PAD, y + i * 30));
  y += sub.length * 30 + 28;

  // The evidence: their real elements, side by side.
  const bottom = H - PAD - 44;
  const tileH = bottom - y - 30;
  const shots = finding.shots.slice(0, 4);
  if (shots.length) {
    const gap = 20;
    const tileW = (W - PAD * 2 - gap * (shots.length - 1)) / shots.length;
    const images = await Promise.all(shots.map((s) => loadImage(s.shot.src)));
    shots.forEach((s, i) => {
      const x = PAD + i * (tileW + gap);
      roundRect(ctx, x, y, tileW, tileH, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = s.flag ? 3 : 1.5;
      ctx.strokeStyle = s.flag ? '#e5484d' : '#e6e6e6';
      ctx.stroke();
      const img = images[i];
      if (img) {
        const scale = Math.min((tileW - 32) / s.shot.w, (tileH - 32) / s.shot.h, 2);
        const dw = s.shot.w * scale;
        const dh = s.shot.h * scale;
        ctx.drawImage(img, x + (tileW - dw) / 2, y + (tileH - dh) / 2, dw, dh);
      }
      ctx.font = `500 16px ${FONT}`;
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText(wrap(ctx, s.caption, tileW - 90, 1)[0] ?? '', x + 4, y + tileH + 8);
      if (s.flag) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e5484d';
        ctx.font = `700 16px ${FONT}`;
        ctx.fillText(s.flag, x + tileW - 4, y + tileH + 8);
        ctx.textAlign = 'left';
      }
    });
  } else if (finding.point.evidence.kind === 'colours') {
    finding.point.evidence.groups.slice(0, 2).forEach((g, gi) => {
      [g.main, ...g.copies].slice(0, 7).forEach((c, ci) => {
        roundRect(ctx, PAD + ci * 120, y + gi * 120, 100, 100, 14);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = ci ? 4 : 1.5;
        ctx.strokeStyle = ci ? '#e5484d' : '#e6e6e6';
        ctx.stroke();
      });
    });
  }

  // Footer: the fix, and where to book.
  ctx.fillStyle = '#171717';
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(`Fix: ${finding.point.fixTitle}`, PAD, H - PAD - 16);
  const href = bookingHref(branding.bookingUrl);
  if (href) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c400b9';
    ctx.fillText(`Book a walkthrough · ${displayUrl(href)}`, W - PAD, H - PAD - 16);
    ctx.textAlign = 'left';
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card.'))), 'image/png'));
}
