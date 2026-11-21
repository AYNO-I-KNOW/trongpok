"use client";

import { useEffect, useState } from "react";
import {
  readSearchHistory,
  rememberSearch,
  type SearchHistoryEntry,
} from "@/ui/trong-pok/lib/history";
import SearchHome from "./SearchHome";

export default function TrongPok({
  fontTheme = "ibm",
}: {
  fontTheme?: "ibm" | "line";
}) {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(readSearchHistory());
    const frame = requestAnimationFrame(refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <SearchHome
      fontTheme={fontTheme}
      history={history}
      onSearchComplete={(query, response) => setHistory(rememberSearch(query, response))}
    />
  );
}
