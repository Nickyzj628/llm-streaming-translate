import { render } from 'solid-js/web';
import Options from '@/options/Options';

const container = document.getElementById('options-root');

if (!container) {
  throw new Error('Could not find root container to mount the app');
}

render(() => <Options />, container);
