import browser from 'webextension-polyfill';

let currentButton: HTMLElement | null = null;

function generateSquirclePath(size: number, n: number): string {
  const center = size / 2;
  const segments = 64;
  const exponent = 2 / n;

  // 起点在 theta = 0（右侧中点），确保路径只画完整一圈
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

  const wrapper = document.createElement('div');
  wrapper.id = 'llm-translate-btn';
  wrapper.style.cssText = `
    position: fixed;
    left: ${mouseX + 8}px;
    top: ${mouseY + 8}px;
    width: 36px;
    height: 36px;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.18)) drop-shadow(0 0 0.5px rgba(0,0,0,0.12));
    cursor: pointer;
    z-index: 999999;
  `;

  const inner = document.createElement('div');
  inner.style.cssText = `
    width: 100%;
    height: 100%;
    background: #ffffff;
    clip-path: url(#llm-squircle);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const img = document.createElement('img');
  img.src = browser.runtime.getURL('assets/icons/translate.png');
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.pointerEvents = 'none';
  inner.appendChild(img);

  wrapper.appendChild(inner);

  wrapper.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  wrapper.addEventListener('mouseup', (e) => {
    e.stopPropagation();
  });

  document.body.appendChild(wrapper);
  currentButton = wrapper;
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
