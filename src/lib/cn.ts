import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Unisce classi Tailwind risolvendo i conflitti (l'ultima vince). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
