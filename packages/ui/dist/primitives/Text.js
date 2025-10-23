import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from './cn';
export function Text({ className, ...props }) {
    return (_jsx("p", { ...props, className: cn(className, 'text-base/6 text-[color:var(--color-text-muted)] sm:text-sm/6') }));
}
export function Strong({ className, ...props }) {
    return _jsx("strong", { ...props, className: cn(className, 'font-medium text-[color:var(--color-text)]') });
}
