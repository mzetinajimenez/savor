"use client";

// One-time app initialization. Renders nothing; its only job is to run useDbInit() — seed the
// DB defaults + request persistent storage — exactly once. Mount a single instance high in the
// tree (the root layout). useDbInit is single-mount by construction (a module-level guard), so
// this is the app's sole data touchpoint in the chrome layer.

import { useDbInit } from "@/lib/hooks";

export default function AppInit() {
  useDbInit();
  return null;
}
