import type { HTMLAttributes } from 'react';
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export declare function Badge({ className, tone, ...props }: {
    className?: string;
    tone?: Tone;
} & HTMLAttributes<HTMLSpanElement>): import("react/jsx-runtime").JSX.Element;
export {};
