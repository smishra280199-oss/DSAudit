/**
 * Preview page entry: the real panel next to an iframe holding a demo page,
 * wired through the PreviewBridge. Lets you develop the panel without
 * reloading an unpacked extension. Run `npm run preview`.
 */
import { PreviewBridge } from '../bridge/preview';
import { mountPanel } from '../extension/panel/mount';

const frame = document.getElementById('page') as HTMLIFrameElement;
const mount = () => mountPanel(document.getElementById('root')!, new PreviewBridge(frame));

if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.location.href !== 'about:blank') mount();
else frame.addEventListener('load', mount, { once: true });
