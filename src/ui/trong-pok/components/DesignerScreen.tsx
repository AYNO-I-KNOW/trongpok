import type { ReactNode } from "react";
import Mascot from "./Mascot";

export default function DesignerScreen({ phase, children, font = "ibm" }: {
  phase: "home" | "clarify" | "search" | "result" | "unsupported";
  children: ReactNode;
  font?: "ibm" | "line";
}) {
  return <main className={`phone ${phase}`} data-font={font}>
    <Mascot phase={phase} />
    {children}
  </main>;
}
