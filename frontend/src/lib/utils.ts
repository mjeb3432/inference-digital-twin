import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn/ui className helper — lets us merge conditional
// Tailwind classes without collisions.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
