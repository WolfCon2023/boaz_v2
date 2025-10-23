import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from './cn';
export function Heading({ className, level = 1, ...props }) {
    const Element = `h${level}`;
    return (_jsx(Element, { ...props, className: cn(className, 'text-2xl/8 font-semibold sm:text-xl/8') }));
}
export function Subheading({ className, level = 2, ...props }) {
    const Element = `h${level}`;
    return (_jsx(Element, { ...props, className: cn(className, 'text-base/7 font-semibold sm:text-sm/6') }));
}
