import browser from 'webextension-polyfill';

let currentButton: HTMLElement | null = null;

function generateSquirclePath(size: number, n: number): string {
  const center = size / 2;
  const segments = 64;
  let path = `M ${center.toFixed(2)} 0`;

  for (let i = 1; i <= segments; i++) {
    const theta = (Math.PI * 2 * i) / segments;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x = center + center * Math.sign(cosT) * Math.abs(cosT) ** (2 / n);
    const y = center + center * Math.sign(sinT) * Math.abs(sinT) ** (2 / n);
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
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

  // 在 objectBoundingBox 坐标系中，36x36 映射到 1x1
  // n=4 的超椭圆路径（归一化到 0-1 范围）
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

  const button = document.createElement('div');
  button.id = 'llm-translate-btn';
  button.style.cssText = `
    position: fixed;
    left: ${mouseX + 8}px;
    top: ${mouseY + 8}px;
    width: 36px;
    height: 36px;
    background: #ffffff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    clip-path: url(#llm-squircle);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    border: none;
    padding: 0;
  `;

  const img = document.createElement('img');
  img.src = browser.runtime.getURL('assets/icons/translate.svg');
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.pointerEvents = 'none';
  button.appendChild(img);

  button.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  button.addEventListener('mouseup', (e) => {
    e.stopPropagation();
  });

  document.body.appendChild(button);
  currentButton = button;
}

export function hide(): void {
  if (currentButton) {
    currentButton.remove();
    currentButton = null;
  }
}

export function onClick(callback: (e: MouseEvent) => void): void {
  if (currentButton) {
    currentButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      callback(e);
    });
  }
}

export function isButtonElement(el: Node): boolean {
  return el === currentButton || (currentButton?.contains(el as Node) ?? false);
}
