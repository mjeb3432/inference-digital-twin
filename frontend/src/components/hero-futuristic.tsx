'use client';
/* ============================================================
 *  hero-futuristic — opening intro for The Forge.
 *  ---------------------------------------------------------
 *  The scan subject is a PROCEDURALLY-GENERATED pixelated
 *  data-center render drawn directly to a HTMLCanvasElement
 *  inside this file. A matching depth map is also generated
 *  on the fly so the depth-parallax shader still works.
 *
 *  Pipeline:
 *    1. drawPixelDataCenter() paints a chunky-pixel isometric
 *       hall (raised-floor tile grid, ceiling cable trays,
 *       receding server racks with LEDs, vanishing-point
 *       doorway glow) onto two off-screen canvases — one for
 *       color, one for depth.
 *    2. Those canvases become THREE.CanvasTexture instances
 *       and feed the existing WebGPU / TSL shader graph.
 *    3. The shader overlays a red dot-flow mask + a vertical
 *       red scan line and bloom as before.
 * ============================================================ */

import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { useAspect } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three/webgpu';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { Mesh } from 'three';
import {
  abs, blendScreen, float, mod, mx_cell_noise_float, oneMinus,
  smoothstep, texture, uniform, uv, vec2, vec3, pass, mix, add,
} from 'three/tsl';

// Three.js exports into r3f's extend registry so `<mesh />` etc.
// resolve to the WebGPU classes.
extend(THREE as any);

// -------------------------------------------------------------
// Procedural Pixelated Data Center
// -------------------------------------------------------------
const CANVAS_W = 960;
const CANVAS_H = 540;
const PIXEL    = 4;      // snap grid — chunky pixel look

const snap = (n: number) => Math.floor(n / PIXEL) * PIXEL;

/** Build the color + depth canvases for the procedural hall. */
function drawPixelDataCenter(): {
  color: HTMLCanvasElement;
  depth: HTMLCanvasElement;
} {
  const color = document.createElement('canvas');
  color.width = CANVAS_W; color.height = CANVAS_H;
  const c = color.getContext('2d')!;
  c.imageSmoothingEnabled = false;

  const depth = document.createElement('canvas');
  depth.width = CANVAS_W; depth.height = CANVAS_H;
  const d = depth.getContext('2d')!;
  d.imageSmoothingEnabled = false;

  // ---- background (Augur deep navy) ----
  c.fillStyle = '#05070B';
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);
  d.fillStyle = '#000';
  d.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Vanishing point (pushed slightly above horizontal centre)
  const VX = CANVAS_W / 2;
  const VY = CANVAS_H * 0.47;

  // ---- CEILING (cable tray slats, cool blue-grey) ----
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const y = snap(VY * (1 - Math.pow(1 - t, 1.8)) * 0.92);
    const a = 0.08 + 0.32 * (1 - t);
    c.fillStyle = `rgba(40, 60, 85, ${a})`;
    c.fillRect(0, y, CANVAS_W, PIXEL);
  }
  // Ceiling linear light, mounted above the aisle (mint wash)
  c.fillStyle = 'rgba(120, 245, 220, 0.30)';
  c.fillRect(snap(VX - 90), snap(VY - 16), 180, PIXEL);
  c.fillStyle = 'rgba(170, 255, 235, 0.60)';
  c.fillRect(snap(VX - 28), snap(VY - 16), 56, PIXEL);

  // ---- FLOOR (raised-tile perspective grid, mint-tinted) ----
  // Horizontal tile lines
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const ease = Math.pow(t, 1.8);
    const y = snap(VY + (CANVAS_H - VY) * ease);
    const a = 0.10 + 0.42 * t;
    c.strokeStyle = `rgba(60, 120, 135, ${a})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, y + 0.5);
    c.lineTo(CANVAS_W, y + 0.5);
    c.stroke();
  }
  // Converging floor lines
  for (let i = -11; i <= 11; i++) {
    const xNear = snap(VX + i * (CANVAS_W * 0.055));
    const grad = c.createLinearGradient(VX, VY, xNear, CANVAS_H);
    grad.addColorStop(0, 'rgba(60, 120, 135, 0.04)');
    grad.addColorStop(1, 'rgba(80, 180, 185, 0.42)');
    c.strokeStyle = grad;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(VX, VY);
    c.lineTo(xNear, CANVAS_H);
    c.stroke();
  }

  // ---- BACK WALL + DOORWAY ----
  const wallW = snap(136);
  const wallH = snap(88);
  c.fillStyle = '#12161E';
  c.fillRect(snap(VX - wallW / 2), snap(VY - wallH / 2), wallW, wallH);
  const doorGrad = c.createRadialGradient(VX, VY, 2, VX, VY, wallW / 2);
  doorGrad.addColorStop(0.0, 'rgba(90, 255, 230, 0.90)');   // bright mint core
  doorGrad.addColorStop(0.5, 'rgba(51, 251, 211, 0.45)');   // Augur accent
  doorGrad.addColorStop(1.0, 'rgba(51, 251, 211, 0)');
  c.fillStyle = doorGrad;
  c.fillRect(snap(VX - wallW / 2), snap(VY - wallH / 2), wallW, wallH);
  // Doorway inner frame (mint glow)
  c.fillStyle = 'rgba(180, 255, 240, 0.60)';
  c.fillRect(snap(VX - 2), snap(VY - wallH / 2 + 8), PIXEL, snap(wallH - 16));

  // ---- RACK ROWS (two walls along the aisle, receding) ----
  // Simple seeded RNG so we get deterministic LEDs.
  const rand = (seed: number) => {
    const s = Math.sin(seed * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };

  const RACK_COUNT = 10;
  const drawRow = (side: 1 | -1) => {
    for (let i = RACK_COUNT - 1; i >= 0; i--) {
      const t = (i + 1) / RACK_COUNT;         // 0 = far, 1 = near
      const ease = Math.pow(t, 1.55);
      const aisleHalf = 22;                   // px at vanishing point
      const farX  = side * aisleHalf;
      const nearX = side * CANVAS_W * 0.50;
      const cx = VX + farX + (nearX - farX) * ease;

      const rackH = snap(48 + 330 * ease);
      const rackW = snap(20 + 150 * ease);
      const rackX = snap(cx - rackW / 2);
      const rackY = snap(VY - rackH * 0.34);

      // Depth map: racks push pixels forward from the corridor gradient.
      const depthVal = Math.floor(30 + 210 * ease);
      d.fillStyle = `rgb(${depthVal},${depthVal},${depthVal})`;
      d.fillRect(rackX, rackY, rackW, rackH);

      // Rack body (navy with subtle mint edge)
      c.fillStyle = '#0A1420';
      c.fillRect(rackX, rackY, rackW, rackH);
      // Side bezels
      c.fillStyle = '#1B2A3C';
      c.fillRect(rackX, rackY, PIXEL, rackH);
      c.fillRect(rackX + rackW - PIXEL, rackY, PIXEL, rackH);
      // Top + bottom caps
      c.fillStyle = '#03060C';
      c.fillRect(rackX, rackY, rackW, PIXEL * 2);
      c.fillRect(rackX, rackY + rackH - PIXEL * 2, rackW, PIXEL * 2);

      const unitH = Math.max(PIXEL * 2, snap(rackH / 22));
      const units = Math.floor((rackH - PIXEL * 6) / unitH);
      const innerX = rackX + PIXEL * 2;
      const innerW = rackW - PIXEL * 4;

      for (let u = 0; u < units; u++) {
        const uy = rackY + PIXEL * 3 + u * unitH;
        // Faceplate
        c.fillStyle = u % 3 === 0 ? '#0F1C2A' : '#0B1624';
        c.fillRect(innerX, uy, innerW, Math.max(PIXEL, unitH - PIXEL));
        // Subtle panel score lines
        if (unitH >= PIXEL * 3) {
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.fillRect(innerX, uy + unitH - PIXEL, innerW, 1);
        }

        // LEDs — only if the unit is tall enough to read
        if (unitH < PIXEL * 3 || innerW < PIXEL * 6) continue;

        const r = rand(i * 53 + u * 17 + (side === 1 ? 7 : 29));
        // Augur palette: mint (healthy) → lime (active) → sky (cool) → red (crit)
        const ledColor =
          r < 0.55 ? '#33FBD3'              // mint — healthy  (accent)
          : r < 0.80 ? '#7BFF9E'            // lime — active   (accent-2)
          : r < 0.93 ? '#6DD6FF'            // sky  — cool     (accent-3)
          : '#FF6B7A';                      // red — crit (rare)
        const ledGlow =
          r < 0.55 ? 'rgba(51, 251, 211, 0.60)'
          : r < 0.80 ? 'rgba(123, 255, 158, 0.60)'
          : r < 0.93 ? 'rgba(109, 214, 255, 0.60)'
          : 'rgba(255, 107, 122, 0.75)';

        const midY = uy + Math.floor(unitH / 2) - Math.floor(PIXEL / 2);
        // Status LED (glow + core)
        c.fillStyle = ledGlow;
        c.fillRect(innerX + PIXEL, midY - PIXEL, PIXEL * 3, PIXEL * 2);
        c.fillStyle = ledColor;
        c.fillRect(innerX + PIXEL * 2, midY, PIXEL, PIXEL);

        // Activity LED (sky blue), sometimes off
        if (rand(i * 2 + u) > 0.28) {
          c.fillStyle = '#6DD6FF';
          c.fillRect(innerX + PIXEL * 5, midY, PIXEL, PIXEL);
        }

        // Port bank on the right (only when rack is big enough) — mint ports
        if (innerW > PIXEL * 14) {
          for (let p = 0; p < 4; p++) {
            const on = rand(i * 11 + u * 3 + p) > 0.45;
            c.fillStyle = on ? 'rgba(120, 245, 220, 0.90)' : 'rgba(45, 75, 95, 0.7)';
            c.fillRect(innerX + innerW - PIXEL * (p + 2) * 2, midY, PIXEL, PIXEL);
          }
        }
      }

      // A GPU-cluster rack every 3rd position: dark teal faceplate with
      // mint indicator strip and a lime "active" pip.
      if (i % 3 === 0 && rackH > 120) {
        const blockH = snap(rackH * 0.28);
        const blockY = rackY + snap(rackH * 0.18);
        c.fillStyle = '#072A2A';
        c.fillRect(innerX, blockY, innerW, blockH);
        c.fillStyle = 'rgba(51, 251, 211, 0.75)';
        for (let k = 0; k < 6; k++) {
          c.fillRect(innerX + PIXEL + k * PIXEL * 2, blockY + snap(blockH / 2), PIXEL, PIXEL);
        }
        c.fillStyle = '#7BFF9E';
        c.fillRect(innerX + innerW - PIXEL * 3, blockY + PIXEL * 2, PIXEL * 2, PIXEL);
      }
    }
  };
  drawRow(-1);
  drawRow(1);

  // ---- DEPTH: corridor radial gradient, combined with racks via lighten ----
  d.globalCompositeOperation = 'lighten';
  const depthGrad = d.createRadialGradient(VX, VY, 6, VX, VY, CANVAS_W * 0.72);
  depthGrad.addColorStop(0.00, 'rgb(0,0,0)');
  depthGrad.addColorStop(0.55, 'rgb(90,90,90)');
  depthGrad.addColorStop(1.00, 'rgb(175,175,175)');
  d.fillStyle = depthGrad;
  d.fillRect(0, 0, CANVAS_W, CANVAS_H);
  d.globalCompositeOperation = 'source-over';

  // ---- Final colour passes ----
  // Mint floor ambient (replaces amber)
  const floorAmbient = c.createLinearGradient(0, VY, 0, CANVAS_H);
  floorAmbient.addColorStop(0, 'rgba(51, 251, 211, 0)');
  floorAmbient.addColorStop(1, 'rgba(51, 251, 211, 0.12)');
  c.fillStyle = floorAmbient;
  c.fillRect(0, VY, CANVAS_W, CANVAS_H - VY);

  // Mint corridor haze at vanishing point
  const haze = c.createRadialGradient(VX, VY, 2, VX, VY, 170);
  haze.addColorStop(0, 'rgba(51, 251, 211, 0.32)');
  haze.addColorStop(1, 'rgba(51, 251, 211, 0)');
  c.fillStyle = haze;
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Secondary sky-blue rim light near the top of the corridor
  const rim = c.createRadialGradient(VX, VY - 40, 8, VX, VY - 40, 220);
  rim.addColorStop(0, 'rgba(109, 214, 255, 0.18)');
  rim.addColorStop(1, 'rgba(109, 214, 255, 0)');
  c.fillStyle = rim;
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle CRT scanlines
  c.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let y = 0; y < CANVAS_H; y += 2) c.fillRect(0, y, CANVAS_W, 1);

  // Vignette
  const vign = c.createRadialGradient(VX, VY, CANVAS_W * 0.25, VX, VY, CANVAS_W * 0.75);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vign;
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);

  return { color, depth };
}

// -------------------------------------------------------------
// PostProcessing — bloom + red scan line overlay
// -------------------------------------------------------------
function PostProcessing({
  strength = 1,
  threshold = 1,
  fullScreenEffect = true,
}: {
  strength?: number;
  threshold?: number;
  fullScreenEffect?: boolean;
}) {
  const { gl, scene, camera } = useThree();
  const progressRef = useRef<{ value: number }>({ value: 0 });

  const render = useMemo(() => {
    const postProcessing = new (THREE as any).PostProcessing(gl as any);
    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode('output');
    const bloomPass = bloom(scenePassColor, strength, 0.5, threshold);

    const uScanProgress = uniform(0);
    progressRef.current = uScanProgress as any;

    const scanPos   = float((uScanProgress as any).value);
    const uvY       = uv().y;
    const scanWidth = float(0.05);
    const scanLine  = smoothstep(0, scanWidth, abs(uvY.sub(scanPos)));
    const redOverlay = vec3(1, 0, 0).mul(oneMinus(scanLine)).mul(0.4);

    const withScanEffect = mix(
      scenePassColor,
      add(scenePassColor, redOverlay),
      fullScreenEffect ? smoothstep(0.9, 1.0, oneMinus(scanLine)) : 1.0,
    );

    const final = withScanEffect.add(bloomPass);
    (postProcessing as any).outputNode = final;
    return postProcessing;
  }, [camera, gl, scene, strength, threshold, fullScreenEffect]);

  useFrame(({ clock }) => {
    progressRef.current.value = Math.sin(clock.getElapsedTime() * 0.5) * 0.5 + 0.5;
    (render as any).renderAsync();
  }, 1);

  return null;
}

// -------------------------------------------------------------
// Scene — depth-parallax plane with red dot-flow mask
// -------------------------------------------------------------
const WIDTH  = CANVAS_W;
const HEIGHT = CANVAS_H;

function Scene() {
  const meshRef = useRef<Mesh>(null);
  const [visible, setVisible] = useState(false);

  // Build the procedural texture + depth map exactly once.
  const { rawMap, depthMap } = useMemo(() => {
    const { color, depth } = drawPixelDataCenter();

    const raw = new (THREE as any).CanvasTexture(color);
    raw.colorSpace = (THREE as any).SRGBColorSpace;
    raw.minFilter  = (THREE as any).NearestFilter;
    raw.magFilter  = (THREE as any).NearestFilter;
    raw.wrapS = raw.wrapT = (THREE as any).ClampToEdgeWrapping;
    raw.needsUpdate = true;

    const dep = new (THREE as any).CanvasTexture(depth);
    dep.minFilter = (THREE as any).LinearFilter;
    dep.magFilter = (THREE as any).LinearFilter;
    dep.wrapS = dep.wrapT = (THREE as any).ClampToEdgeWrapping;
    dep.needsUpdate = true;

    return { rawMap: raw, depthMap: dep };
  }, []);

  useEffect(() => { setVisible(true); }, []);

  const { material, uniforms } = useMemo(() => {
    const uPointer = uniform(new (THREE as any).Vector2(0));
    const uProgress = uniform(0);
    const parallaxStrength = 0.01;

    const tDepthMap = texture(depthMap);
    const tMap = texture(rawMap, uv().add(tDepthMap.r.mul(uPointer).mul(parallaxStrength)));

    const aspect  = float(WIDTH).div(HEIGHT);
    const tUv     = vec2(uv().x.mul(aspect), uv().y);
    const tiling  = vec2(120.0);
    const tiledUv = mod(tUv.mul(tiling), 2.0).sub(1.0);
    const brightness = mx_cell_noise_float(tUv.mul(tiling).div(2));

    const dist = float(tiledUv.length());
    const dotShape = float(smoothstep(0.5, 0.49, dist)).mul(brightness);

    const flow = oneMinus(smoothstep(0, 0.02, abs(tDepthMap.sub(uProgress))));
    const mask = dotShape.mul(flow).mul(vec3(10, 0, 0));

    const finalColor = blendScreen(tMap, mask);

    const material = new (THREE as any).MeshBasicNodeMaterial({
      colorNode: finalColor,
      transparent: true,
      opacity: 0,
    });

    return { material, uniforms: { uPointer, uProgress } };
  }, [rawMap, depthMap]);

  const [w, h] = useAspect(WIDTH, HEIGHT);

  useFrame(({ clock }) => {
    (uniforms.uProgress as any).value = Math.sin(clock.getElapsedTime() * 0.5) * 0.5 + 0.5;
    if (meshRef.current) {
      const mat = (meshRef.current as any).material;
      if (mat && 'opacity' in mat) {
        mat.opacity = (THREE as any).MathUtils.lerp(mat.opacity, visible ? 1 : 0, 0.07);
      }
    }
  });

  useFrame(({ pointer }) => {
    (uniforms.uPointer as any).value = pointer;
  });

  const scaleFactor = 0.55;
  return (
    <mesh ref={meshRef} scale={[w * scaleFactor, h * scaleFactor, 1]} material={material}>
      <planeGeometry />
    </mesh>
  );
}

// -------------------------------------------------------------
// Outer component — text overlay + canvas
// -------------------------------------------------------------
export function HeroFuturistic({ onEnter }: { onEnter?: () => void }) {
  const titleWords = ['THE', 'FORGE'];
  const subtitle   = 'A live digital twin for AI data centers — power, cooling, compute, and tokens, end to end.';
  const [visibleWords, setVisibleWords] = useState(0);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [delays, setDelays] = useState<number[]>([]);
  const [subtitleDelay, setSubtitleDelay] = useState(0);

  useEffect(() => {
    setDelays(titleWords.map(() => Math.random() * 0.07));
    setSubtitleDelay(Math.random() * 0.1);
  }, []);

  useEffect(() => {
    if (visibleWords < titleWords.length) {
      const t = setTimeout(() => setVisibleWords(v => v + 1), 520);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSubtitleVisible(true), 700);
    return () => clearTimeout(t);
  }, [visibleWords, titleWords.length]);

  return (
    <div className="h-svh w-full">
      <div className="h-svh uppercase items-center w-full absolute z-[60] pointer-events-none px-10 flex justify-center flex-col">
        <p className="font-mono text-[11px] md:text-xs tracking-[0.42em] text-white/60 mb-6">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-forge-accent mr-3 align-middle shadow-[0_0_12px_rgba(51,251,211,0.85)] animate-pulse" />
          INFERENCE INFRASTRUCTURE DIGITAL TWIN
        </p>

        <div className="font-display text-6xl md:text-8xl xl:text-9xl 2xl:text-[10rem] font-bold leading-[0.92] tracking-tight">
          <div className="flex space-x-4 lg:space-x-10 overflow-hidden">
            {titleWords.map((word, index) => (
              <div
                key={index}
                className={index < visibleWords ? 'fade-in' : ''}
                style={{
                  animationDelay: `${index * 0.13 + (delays[index] || 0)}s`,
                  opacity: index < visibleWords ? undefined : 0,
                  background: 'linear-gradient(180deg, #F2F7FF 0%, #7BFF9E 55%, #33FBD3 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 0 40px rgba(51, 251, 211, 0.40)',
                }}
              >
                {word}
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl text-center text-sm md:text-lg xl:text-xl mt-6 overflow-hidden text-white/80 font-sans font-medium normal-case tracking-normal">
          <div
            className={subtitleVisible ? 'fade-in-subtitle' : ''}
            style={{
              animationDelay: `${titleWords.length * 0.13 + 0.2 + subtitleDelay}s`,
              opacity: subtitleVisible ? undefined : 0,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="explore-btn"
        style={{ animationDelay: '1.8s', animationFillMode: 'forwards' }}
        onClick={(e) => { e.stopPropagation(); onEnter?.(); }}
      >
        Enter the hall
        <span className="explore-arrow">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="arrow-svg">
            <path d="M11 5V17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <path d="M6 12L11 17L16 12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </span>
      </button>

      <Canvas
        flat
        gl={async (props) => {
          // Prefer WebGPU; fall back silently to WebGL if unsupported.
          try {
            const renderer = new (THREE as any).WebGPURenderer(props);
            await renderer.init();
            return renderer;
          } catch (err) {
            console.warn('[hero] WebGPU unavailable, falling back to WebGL', err);
            const renderer = new (THREE as any).WebGPURenderer({ ...props, forceWebGL: true });
            await renderer.init();
            return renderer;
          }
        }}
      >
        <PostProcessing fullScreenEffect={true} />
        <Scene />
      </Canvas>
    </div>
  );
}

export default HeroFuturistic;
