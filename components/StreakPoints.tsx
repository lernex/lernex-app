"use client";
import { useEffect } from "react";
import { useLernexStore } from "@/lib/store";

export default function StreakPoints() {
  const bump = useLernexStore((s) => s.bumpStreakIfNewDay);
  useEffect(() => { bump(); }, [bump]);
  return null;
}
