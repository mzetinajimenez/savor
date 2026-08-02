"use client";

// One-time app initialization. Renders nothing; its jobs are to run useDbInit() — seed the DB
// defaults + request persistent storage — exactly once, and to strip a stale `?sheet=` param
// left over from a reload or shared link. Mount a single instance high in the tree (the root
// layout). Both effects are single-mount by construction, so this is the app's sole data
// touchpoint in the chrome layer.

import { useDbInit } from "@/lib/hooks";
import { useStripSheetParamOnLoad } from "@/lib/useSheetParam";

export default function AppInit() {
  useDbInit();
  // ?sheet= is ephemeral — never let a reload or a shared link restore an open sheet.
  useStripSheetParamOnLoad();
  return null;
}
