'use client';
/* ============================================================
 *  hero-futuristic — opening intro for The Forge.
 *  ---------------------------------------------------------
 *  Near-verbatim port of the 21st.dev reference component,
 *  with two changes:
 *    1. Texture + depth map point at a data-center photo
 *       instead of the original hand.
 *    2. Title reads "THE FORGE" with the Forge kicker/subtitle.
 *
 *  Relies on WebGPU via three.js r168. The parent App wires
 *  click/keyboard/auto-dismiss so the user is never trapped.
 * ============================================================ */

import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { useAspect, useTexture } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three/webgpu';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { Mesh } from 'three';
import {
  abs, blendScreen, float, mod, mx_cell_noise_float, oneMinus,
  smoothstep, texture, uniform, uv, vec2, vec3, pass, mix, add,
} from 'three/tsl';

// Swap these two URLs for a CDHI-01 photograph + matching MiDaS
// depth map when available. Both must be same-dimension, CORS-
// enabled, and the depth map must be grayscale.
const TEXTUREMAP = { src: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1920&q=80' };
const DEPTHMAP   = { src: 'https://i.postimg.cc/2SHKQh2q/raw-4.webp' };

// Three.js exports into r3f's extend registry so `<mesh />` etc.
// resolve to the WebGPU classes.
extend(THREE as any);

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
const WIDTH = 300;
const HEIGHT = 300;

function Scene() {
  const [rawMap, depthMap] = useTexture([TEXTUREMAP.src, DEPTHMAP.src]);
  const meshRef = useRef<Mesh>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rawMap && depthMap) setVisible(true);
  }, [rawMap, depthMap]);

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
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-forge-amber mr-3 align-middle shadow-[0_0_12px_rgba(245,166,35,0.85)] animate-pulse" />
          INFERENCE INFRASTRUCTURE DIGITAL TWIN · SIMPLY SILICON
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
                  background: 'linear-gradient(180deg, #ffffff 0%, #ffd8a8 55%, #f5a623 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 0 40px rgba(245, 166, 35, 0.35)',
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
