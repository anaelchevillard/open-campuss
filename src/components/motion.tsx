"use client";

import { MotionConfig } from "motion/react";
import { Suspense, type ReactNode } from "react";
import { NavProgress } from "@/components/nav-progress";
import { Tracker } from "@/components/tracker";

export function Motion({ children, reduce }: { children: ReactNode; reduce?: boolean }) {
  return <MotionConfig reducedMotion={reduce ? "always" : "user"} transition={{ type: "spring", stiffness: 420, damping: 36 }}><Suspense><NavProgress /></Suspense><Tracker />{children}</MotionConfig>;
}
