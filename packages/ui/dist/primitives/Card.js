import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from './cn';
export function Card({ className, children, ...props }) {
    return (_jsx("div", { className: cn('rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-[var(--shadow-1)]', className), ...props, children: children }));
}
export function CardHeader({ className, children, ...props }) {
    return (_jsx("div", { className: cn('px-4 py-3 border-b border-[color:var(--color-border)]', className), ...props, children: children }));
}
export function CardContent({ className, children, ...props }) {
    return (_jsx("div", { className: cn('p-4', className), ...props, children: children }));
}
export function CardFooter({ className, children, ...props }) {
    return (_jsx("div", { className: cn('px-4 py-3 border-t border-[color:var(--color-border)]', className), ...props, children: children }));
}
