/** panel.html entry: the side panel running against the real browser. */
import { ChromeBridge } from '../../bridge/chrome';
import { mountPanel } from './mount';

mountPanel(document.getElementById('root')!, new ChromeBridge());
