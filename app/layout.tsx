import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Omni-Kinetic — Sim-to-Real Embodied AI Studio',
  description: 'Browser-native robotics training studio with Nemotron physical reasoning, cloud physics streaming, Three.js spatial visualizer, and WebGPU/WASM CV teleoperation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-charcoal-deep text-cream antialiased selection:bg-sage selection:text-cream">
        {children}
      </body>
    </html>
  );
}
