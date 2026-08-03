import { MigoLogo } from './MigoLogo';

/** Logo Migo oficial. `variant='dark'` para fondos morados. */
export function Logo({ width = 140, variant = 'light' }: { width?: number; variant?: 'light' | 'dark' }) {
  return <MigoLogo width={width} variant={variant} />;
}
