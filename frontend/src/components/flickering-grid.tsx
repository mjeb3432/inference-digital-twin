import { useEffect, useRef } from 'react';

// Placeholder port of 21st.dev `flickering-grid-hero`.
// Paste the real component here when ready. This stub renders a
// lightweight canvas-grid stand-in so the layout has the texture
// without the real animation.
export function FlickeringGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    size();

    let raf = 0;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const cell = 18;
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          const flicker = Math.random() > 0.985;
          ctx.fillStyle = flicker
            ? 'rgba(245, 166, 35, 0.55)'
            : 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(x, y, 1, 1);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => size();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}

export default FlickeringGrid;
