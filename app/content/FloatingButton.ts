import browser from 'webextension-polyfill';

let currentButton: HTMLElement | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;

function generateSquirclePath(size: number, n: number): string {
  const center = size / 2;
  const segments = 64;
  const exponent = 2 / n;

  const startX = center + center * Math.cos(0) ** exponent;
  const startY = center + center * Math.sin(0) ** exponent;
  let path = `M ${startX.toFixed(3)} ${startY.toFixed(3)}`;

  for (let i = 1; i < segments; i++) {
    const theta = (Math.PI * 2 * i) / segments;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x = center + center * Math.sign(cosT) * Math.abs(cosT) ** exponent;
    const y = center + center * Math.sign(sinT) * Math.abs(sinT) ** exponent;
    path += ` L ${x.toFixed(3)} ${y.toFixed(3)}`;
  }

  path += ' Z';
  return path;
}

function ensureClipPath(): void {
  if (document.getElementById('llm-squircle')) return;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';

  const defs = document.createElementNS(svgNS, 'defs');
  const clipPath = document.createElementNS(svgNS, 'clipPath');
  clipPath.setAttribute('id', 'llm-squircle');
  clipPath.setAttribute('clipPathUnits', 'objectBoundingBox');

  const path = document.createElementNS(svgNS, 'path');
  const d = generateSquirclePath(1, 4);
  path.setAttribute('d', d);

  clipPath.appendChild(path);
  defs.appendChild(clipPath);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

export function show(mouseX: number, mouseY: number): void {
  hide();
  ensureClipPath();

  const wrapper = document.createElement('div');
  wrapper.id = 'llm-translate-btn';
  wrapper.style.cssText = `
    position: fixed;
    left: ${mouseX}px;
    top: ${mouseY}px;
    width: 40px;
    height: 40px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.12)) drop-shadow(0 4px 8px rgba(0,0,0,0.1));
    cursor: pointer;
    z-index: 999999;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 150ms ease, transform 150ms ease;
  `;

  const inner = document.createElement('div');
  inner.style.cssText = `
    width: 36px;
    height: 36px;
    margin: 2px;
    background: #ffffff;
    clip-path: url(#llm-squircle);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const img = document.createElement('img');
  img.src = browser.runtime.getURL('32.png');
  img.style.cssText = `
    width: 20px;
    height: 20px;
    pointer-events: none;
  `;
  inner.appendChild(img);

  wrapper.appendChild(inner);

  function resetScale(): void {
    if (wrapper.isConnected) {
      wrapper.style.transform = 'scale(1)';
    }
  }

  wrapper.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    wrapper.style.transform = 'scale(0.96)';
  });
  wrapper.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    resetScale();
  });
  wrapper.addEventListener('mouseleave', resetScale);

  document.body.appendChild(wrapper);
  currentButton = wrapper;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (wrapper.isConnected) {
        wrapper.style.opacity = '1';
        wrapper.style.transform = 'scale(1)';
      }
    });
  });
}

export function hide(): void {
  if (currentButton) {
    if (clickHandler) {
      currentButton.removeEventListener('click', clickHandler);
      clickHandler = null;
    }
    currentButton.remove();
    currentButton = null;
  }
}

export function onClick(callback: (e: MouseEvent) => void): void {
  if (!currentButton || clickHandler) return;
  clickHandler = (e) => {
    e.stopPropagation();
    e.preventDefault();
    callback(e);
  };
  currentButton.addEventListener('click', clickHandler);
}

export function isButtonElement(el: Node): boolean {
  return el === currentButton || (currentButton?.contains(el as Node) ?? false);
}
