import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from './cn';
export function Divider({ soft = false, className, ...props }) {
    return (_jsx("hr", { role: "presentation", ...props, className: cn(className, 'w-full border-t border-[color:var(--color-border)]', soft && 'opacity-50') }));
}
