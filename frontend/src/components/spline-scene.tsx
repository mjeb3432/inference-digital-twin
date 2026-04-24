// Spline 3D scene placeholder. Spline embeds as an iframe — drop the
// URL from your spline.design project and it'll render inline.
// Leaving the src empty on purpose so an unconfigured build doesn't
// try to hit a nonexistent scene.
export function SplineScene({ src }: { src?: string }) {
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="font-mono text-[10px] tracking-[0.22em] text-white/25 uppercase">
          Spline scene not configured · set src in SplineScene
        </p>
      </div>
    );
  }
  return (
    <iframe
      src={src}
      title="Forge facility 3D"
      className="w-full h-full border-0"
      allow="autoplay; fullscreen"
    />
  );
}

export default SplineScene;
