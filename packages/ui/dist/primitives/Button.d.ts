import type { ButtonHTMLAttributes, ReactNode } from 'react';
export type ButtonProps = {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
    size?: 'sm' | 'md' | 'lg';
    icon?: ReactNode;
    loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;
export declare function Button({ variant, size, icon, children, className, loading, disabled, ...props }: ButtonProps): import("react/jsx-runtime").JSX.Element;
