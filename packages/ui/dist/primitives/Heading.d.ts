type HeadingProps = {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
} & React.ComponentPropsWithoutRef<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>;
export declare function Heading({ className, level, ...props }: HeadingProps): import("react/jsx-runtime").JSX.Element;
export declare function Subheading({ className, level, ...props }: HeadingProps): import("react/jsx-runtime").JSX.Element;
export {};
