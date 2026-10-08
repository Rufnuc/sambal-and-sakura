"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

// Fires the browser print dialog once on load (operator can also re-print).
// The toolbar is hidden on the printed page via the `print:hidden` class.
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="print:hidden mb-4 flex items-center gap-2">
      <Button className="h-10 gap-1.5" onClick={() => window.print()}>
        <Printer className="size-4" /> Print ticket
      </Button>
      <Button variant="outline" className="h-10" onClick={() => window.close()}>Close</Button>
    </div>
  );
}
