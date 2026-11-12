import type { Metadata } from 'next';
import { Inter, Courier_Prime } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
      <body className={`${inter.variable} ${courierPrime.variable} bg-charcoal-deep text-cream antialiased selection:bg-sage selection:text-cream`}>
        {children}
      </body>
    </html>
  );
}
