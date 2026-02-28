"use client";

import dynamic from "next/dynamic";

// Workbench uses Three.js — must skip SSR
const Workbench = dynamic(() => import("@/components/Workbench"), { ssr: false });

export default function Home() {
  return <Workbench />;
}
