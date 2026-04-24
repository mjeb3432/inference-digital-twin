import { useState, useEffect } from 'react';
import { HeroFuturistic } from './components/hero-futuristic';
import { ForgeShell } from './components/forge-shell';

// App wraps the cinematic intro around the main Forge UI.
// The intro dismisses itself after 7s OR on user input — after
// that the real control-room interface takes over.
export default function App() {
  const [introComplete, setIntroComplete] = useState(false);

  // Escape/Enter/Space/click all dismiss the intro. We wire this at
  // the App level so it's impossible to get trapped on the title page.
  useEffect(() => {
    const skip = () => setIntroComplete(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') skip();
    };

    window.addEventListener('keydown', onKey);
    const timer = window.setTimeout(skip, 7000);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-forge-bg">
      {!introComplete && (
        <div
          className="absolute inset-0 z-50 cursor-pointer transition-opacity duration-700"
          onClick={() => setIntroComplete(true)}
        >
          <HeroFuturistic onEnter={() => setIntroComplete(true)} />
        </div>
      )}

      <ForgeShell />
    </div>
  );
}
