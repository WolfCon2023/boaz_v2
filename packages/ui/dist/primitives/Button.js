import { jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from './cn';
const base = 'inline-flex items-center gap-2 rounded-2xl font-medium focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)] disabled:opacity-50';
const variantClasses = {
    primary: 'bg-[color:var(--color-primary-600)] text-white hover:bg-[color:var(--color-primary-700)]',
    secondary: 'bg-[color:var(--color-muted)] text-[color:var(--color-text)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-panel)]',
    ghost: 'bg-transparent text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]',
    danger: 'bg-[color:var(--color-danger)] text-white hover:brightness-95',
    link: 'bg-transparent text-[color:var(--color-primary)] hover:underline p-0',
};
const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
};
export function Button({ variant = 'primary', size = 'md', icon, children, className, loading, disabled, ...props }) {
    return (_jsxs("button", { className: cn(base, variantClasses[variant], sizeClasses[size], className), disabled: disabled || loading, ...props, children: [icon, children] }));
}
