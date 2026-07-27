"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";

interface RevealProps extends Omit<ComponentProps<typeof motion.div>, "children"> {
  children: ReactNode;
  /** Set true for content already visible on first paint (e.g. the page's
   * first block) to avoid any CLS/LCP risk from an entrance animation. */
  disabled?: boolean;
}

/**
 * Subtle `whileInView` entrance for below-the-fold sections. Server
 * components can fetch their own data and pass the rendered JSX straight
 * through as `children` — this wrapper never needs the data itself.
 */
export function Reveal({ children, disabled, className, ...props }: RevealProps) {
  const reduceMotion = useReducedMotion();
  if (disabled || reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
