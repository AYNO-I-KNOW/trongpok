"use client";

import { useEffect, useState } from "react";
import { manufacturerExample } from "@/ui/trong-pok/lib/research";
import {
  historyResult,
  readHistory,
  rememberSearch,
  type HistoryEntry,
} from "@/ui/trong-pok/lib/history";
import type { Conditions } from "@/ui/trong-pok/lib/types";
import HomeHistory from "./HomeHistory";
import Results from "./Results";
import Mascot from "./Mascot";
import SearchHome from "./SearchHome";

export default function TrongPok({
  rankingDemo,
  fontTheme = "ibm",
}: {
  rankingDemo: boolean;
  fontTheme?: "ibm" | "line";
}) {
  const [example, setExample] = useState(() =>
    rankingDemo ? manufacturerExample() : null,
  );
  const [initialQuery, setInitialQuery] = useState("");
  const [autoSearch, setAutoSearch] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(readHistory());
    const frame = requestAnimationFrame(refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function exitExample(query = "", search = false) {
    setAutoSearch(search);
    setInitialQuery(query);
    setExample(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }

  function searchWithConditions(conditions: Conditions) {
    if (!example) return;
    const containers = {
      bottle600: "ขวด 600 มล.",
      mainJar: "โถหลัก",
      grinder: "โถบด",
      unknown: "",
    };
    const details = [
      example.plan.raw || "เครื่องปั่น",
      containers[conditions.container],
      conditions.cubes === null ? "" : `ปั่นน้ำแข็ง ${conditions.cubes} ก้อน`,
      conditions.pulse === null ? "" : `Pulse ${conditions.pulse} ครั้ง`,
      conditions.budget === null ? "" : `งบไม่เกิน ${conditions.budget} บาท`,
    ];
    exitExample(details.filter(Boolean).join("\n"), true);
  }

  if (example)
    return (
      <main className="phone result" data-font={fontTheme}>
        <Mascot phase="result" />
        <Results
          result={example}
          onReset={() => exitExample()}
          onBack={() => exitExample(example.plan.raw)}
          onConditions={searchWithConditions}
        />
      </main>
    );

  return (
    <SearchHome
      fontTheme={fontTheme}
      initialQuery={initialQuery}
      autoSearch={autoSearch}
      onSearchComplete={(query, response) => setHistory(rememberSearch(query, response))}
      history={
        history.length ? (
          <HomeHistory
            items={history}
            onOpen={(entry) => setExample(historyResult(entry))}
          />
        ) : null
      }
    />
  );
}
