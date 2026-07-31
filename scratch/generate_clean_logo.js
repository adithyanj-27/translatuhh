import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0df2c9" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="#8b5cf6" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#05070c" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0df2c9"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>

    <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>

    <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="110" fill="#05070c"/>
  <rect width="504" height="504" x="4" y="4" rx="106" fill="none" stroke="rgba(13, 242, 201, 0.3)" stroke-width="4"/>
  <circle cx="256" cy="256" r="210" fill="url(#bgGlow)"/>

  <!-- Minimalist Head Profile & Soundwaves (🗣️) -->
  <g transform="translate(15, 0)">
    <!-- Speaking Silhouette Head -->
    <path d="M 120 400 
             C 120 330, 150 285, 185 265
             C 175 245, 165 220, 165 190
             C 165 115, 215 65, 280 65
             C 345 65, 385 105, 385 165
             C 385 195, 375 220, 360 240
             C 340 265, 320 270, 305 285
             C 290 300, 270 315, 240 325
             C 210 335, 185 360, 175 400
             Z" 
          fill="url(#headGrad)" opacity="0.92"/>

    <!-- Clean Curved Soundwave Arcs Emitted from Head -->
    <path d="M 335 175 A 40 40 0 0 1 335 235" fill="none" stroke="url(#waveGrad)" stroke-width="14" stroke-linecap="round" filter="url(#neonGlow)"/>
    <path d="M 370 150 A 70 70 0 0 1 370 260" fill="none" stroke="url(#waveGrad)" stroke-width="14" stroke-linecap="round" filter="url(#neonGlow)"/>
    <path d="M 405 125 A 100 100 0 0 1 405 285" fill="none" stroke="url(#waveGrad)" stroke-width="14" stroke-linecap="round" filter="url(#neonGlow)"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(__dirname, '../public/logo.svg'), svgContent);
fs.writeFileSync(path.join(__dirname, '../public/logo.png'), svgContent);
fs.writeFileSync(path.join(__dirname, '../public/icon-192.png'), svgContent);
fs.writeFileSync(path.join(__dirname, '../public/icon-512.png'), svgContent);

console.log("Clean vector logo updated successfully!");
