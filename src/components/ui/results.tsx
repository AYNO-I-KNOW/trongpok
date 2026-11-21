"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product, Ranked } from "@/lib/types";
import type { RunRecord } from "@/lib/ui/contracts";
import { comparisonProduct, money, outboundLink, safeQuotes, statusText, trustText } from "@/lib/ui/presentation";
import { readRun } from "@/lib/ui/storage";
import DesignerScreen from "@/ui/trong-pok/components/DesignerScreen";
import { ComparisonDisclosure, ComparisonResults, ComparisonTable, type ComparisonColumn } from "@/ui/trong-pok/components/ComparisonTable";
import { MockVisual } from "@/ui/trong-pok/components/Results";
import { EmptyState, ModeBadge } from "./shared";
import { ProductEvidence } from "./product-detail";

type Pick = { row: Ranked; product: Product; rank: number };
const detailHref = (product: Product, run: RunRecord) => `/p/${encodeURIComponent(product.id)}?run=${encodeURIComponent(run.id)}`;

function resultPicks(run: RunRecord): Pick[] {
  return run.result.ranked.flatMap((row, index) => {
    const product = run.products.find((candidate) => candidate.id === row.productId);
    return product ? [{ product, row, rank: index + 1 }] : [];
  });
}

function useSavedRun(runId: string) {
  const [state, setState] = useState<{ id: string; run: RunRecord | null }>();
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setState({ id: runId, run: runId ? readRun(runId) : null }); });
    return () => { active = false; };
  }, [runId]);
  const loaded = state?.id === runId;
  return { loaded, run: loaded ? state.run : null };
}

function makeColumn({ product, row, rank }: Pick, run: RunRecord): ComparisonColumn {
  const imageUrl = product.imageUrl ? new URL(product.imageUrl) : undefined;
  const imageHost = imageUrl?.hostname.replace(/\.$/, "");
  const shopeeImage = imageHost === "shopee.co.th" || imageHost?.endsWith(".shopee.co.th");
  return {
    id: product.id, title: product.title, price: `฿${money(product.priceThb)}`,
    image: imageUrl?.protocol === "https:" && !shopeeImage ? imageUrl.href : undefined,
    placeholder: product.category === "blender" ? <MockVisual index={rank - 1} />
      : <span className="product-option">ไม่มีภาพสินค้า</span>,
    rank, context: product.id === run.linkedProductId ? "รุ่นที่คุณส่งมา" : "",
    fit: { value: row.fitPct, label: `${product.title} เหมาะ ${row.fitPct} เปอร์เซ็นต์`,
      tone: row.mustOk ? rank === 1 ? "high" : "pending" : "low" },
    action: run.preview ? <span className="purchase-note">ไม่มีลิงก์ซื้อ</span>
      : <a className="product-action" href={outboundLink(product)} target="_blank" rel="noopener noreferrer"
        aria-label={`ดูสินค้า ${product.title} ที่ Shopee`}>ดูสินค้า</a>,
  };
}

function Savings({ row, product, run }: Pick & { run: RunRecord }) {
  const comparison = comparisonProduct(run.products, product);
  if (!row.mustOk || !row.savings || !comparison) return <>ไม่มีส่วนต่างราคาให้เปรียบเทียบ</>;
  return <><strong>ประหยัด ฿{money(row.savings)}</strong><p>เทียบกับ {comparison.title}</p>
    {row.unusedFeatures.length > 0 && <p>ฟีเจอร์ที่อาจไม่ได้ใช้: {row.unusedFeatures.join(" · ")}</p>}</>;
}

function LinkedNotice({ run, picks }: { run: RunRecord; picks: Pick[] }) {
  const linked = run.products.find((product) => product.id === run.linkedProductId);
  if (!linked || picks[0]?.product.id === linked.id) return null;
  const pick = picks.find(({ product }) => product.id === linked.id);
  const failures = pick?.row.requirements.filter((item) => item.status === "fail" || item.status === "contradicted") ?? [];
  const names = failures.flatMap((item) => {
    const requirement = run.result.requirements.find((value) => value.id === item.requirementId);
    return requirement ? [requirement.text] : [];
  });
  return <aside className="evidence-decision linked-result">
    <h2>สินค้าที่คุณส่งมา: {linked.title}</h2>
    <p>{names.length ? `ยังไม่ผ่าน: ${names.join(" · ")}` : pick
      ? "ตัวเลือกอื่นได้อันดับสูงกว่าตามโจทย์นี้" : "ข้อมูลไม่พอที่จะยืนยันผลของรุ่นนี้"}</p>
    {safeQuotes(linked, failures.flatMap((item) => item.quotes)).slice(0, 2).map((label) =>
      <blockquote key={`${label.reviewId}-${label.subjectId}`}>“{label.quote}”</blockquote>)}
    {pick && <Link className="evidence-link" href={detailHref(linked, run)}>ดูหลักฐานของรุ่นนี้ ↗</Link>}
  </aside>;
}

function ResultView({ run, picks, detail }: { run: RunRecord; picks: Pick[]; detail?: Pick }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();
  const shown = picks.slice(0, 3);
  const [first] = shown;
  const resultUrl = `/results?run=${encodeURIComponent(run.id)}`;

  function row(label: string, display: (pick: Pick) => ReactNode, className?: string) {
    return <tbody key={label}><tr className="row-label"><td colSpan={shown.length}>{label}</td></tr>
      <tr className={className}>{shown.map((pick) => <td key={pick.product.id} data-product-id={pick.product.id}>{display(pick)}</td>)}</tr>
    </tbody>;
  }

  function section(id: string, title: string, content: ReactNode) {
    return <ComparisonDisclosure id={id} title={title} open={expanded === id} span={shown.length}
      onToggle={() => setExpanded(expanded === id ? null : id)}>{content}</ComparisonDisclosure>;
  }

  return <DesignerScreen phase="result" font={run.font}>
    <ComparisonResults headline="เปรียบเทียบรุ่นตามโจทย์"
      reason={first.row.mustOk ? "เลือกจากเงื่อนไข ราคา และหลักฐานตามการใช้งานของคุณ" : "ยังไม่พบรุ่นที่ผ่านทุกเงื่อนไข ลองตรวจข้อจำกัดก่อนตัดสินใจ"}
      notice={<ModeBadge preview={run.preview} mode={run.result.mode} />} mock={run.preview}
      onBack={() => router.push(run.font === "line" ? "/?font=line" : "/")}
      onReset={() => router.push(run.font === "line" ? "/compare?font=line" : "/compare")}>
      <LinkedNotice picks={picks} run={run} />
      <ComparisonTable columns={shown.map((pick) => makeColumn(pick, run))}>
        {row("เหตุผล", ({ row: ranked }) => ranked.why || "ดูหลักฐานรายเงื่อนไข", "reason-row")}
        {section("result-panel-usage", "วิธีใช้และข้อจำกัด", <>
          {run.result.requirements.map((requirement) => row(requirement.text, ({ row: ranked, product }) => {
            const assessment = ranked.requirements.find((item) => item.requirementId === requirement.id);
            const quote = safeQuotes(product, assessment?.quotes ?? [])[0];
            const status = assessment?.status ?? "unknown";
            const verdict = status === "pass" ? "pass" : status === "fail" || status === "contradicted" ? "fail" : "unknown";
            return <><span className={`verdict ${verdict}`}>{statusText[status]}</span>{quote && <p>“{quote.quote}”</p>}</>;
          }))}
          {row("ข้อแลกเปลี่ยน", ({ row: ranked }) => ranked.tradeoff || "ดูข้อจำกัดตามเงื่อนไขข้างต้น", "tradeoff-row")}
        </>)}
        {section("result-panel-evidence", "เหตุผลและหลักฐาน", <>
          {row("ความตรงปก", ({ product, row: ranked }) => trustText(product, ranked))}
          {row("ข้อสังเกตจาก Skeptic", ({ product, row: ranked }) => {
            const objection = safeQuotes(product, ranked.objections)[0];
            return objection ? <>“{objection.quote}”</> : "ไม่พบรีวิวขัดแย้งในผลรอบนี้";
          })}
          <tbody className="evidence-actions"><tr>{shown.map(({ product }) => <td key={product.id}>
            <Link className="evidence-link" href={detailHref(product, run)} aria-label={`ดูหลักฐาน ${product.title}`}>ดูหลักฐาน ↗</Link>
          </td>)}</tr></tbody>
        </>)}
        {section("result-panel-stores", "ร้านค้าและรีวิว", <>
          {row("ร้านค้า", ({ product }) => product.shop.name)}
          {row("รีวิว", ({ product, row: ranked }) => <><strong>{product.stars.toFixed(1)} / 5</strong>
            <span className="review-count">n = {money(product.ratingCount)}</span>
            {ranked.reviewQualityWarning && <p className="review-topic">{ranked.reviewQualityWarning.message}</p>}
          </>)}
          {row("ส่วนต่างราคา", (pick) => <Savings {...pick} run={run} />)}
        </>)}
      </ComparisonTable>
      {picks.length > shown.length && <details className="method">
        <summary>ตัวเลือกเพิ่มเติม</summary>
        <div className="evidence-model-list">{picks.slice(shown.length).map(({ product, rank, row }) =>
          <Link className="evidence-link" href={detailHref(product, run)} key={product.id}>
            <span>{rank}. {product.title}</span><span>เหมาะ {row.fitPct}% ↗</span>
          </Link>)}</div>
      </details>}
      {detail && <ProductEvidence {...detail} run={run} onClose={() => router.replace(resultUrl)} />}
    </ComparisonResults>
  </DesignerScreen>;
}

export function Results({ runId, productId }: { runId: string; productId?: string }) {
  const { run, loaded } = useSavedRun(runId);
  if (!loaded) return <DesignerScreen phase="search"><section className="search-copy" role="status"><h1>กำลังเปิดผลเปรียบเทียบ…</h1></section></DesignerScreen>;
  if (!run) return <EmptyState title="ยังไม่พบผลเปรียบเทียบนี้" text="ผลจะเก็บไว้ในแท็บที่เริ่มเปรียบเทียบเป็นเวลา 24 ชั่วโมง กรุณาเริ่มรอบใหม่หากเปิดจากอุปกรณ์หรือแท็บอื่น" />;
  const picks = resultPicks(run);
  if (!picks.length) return <EmptyState title="ยังไม่มีตัวเลือกที่เปรียบเทียบได้" text="ลองเปลี่ยนหมวดหรือปรับความต้องการ แล้วเปรียบเทียบอีกครั้ง" />;
  const detail = productId ? picks.find(({ product }) => product.id === productId) : undefined;
  if (productId && !detail) return <EmptyState title="ไม่พบสินค้านี้ในผลเปรียบเทียบ" text="เปิดรายละเอียดจากหน้าผลเปรียบเทียบในแท็บเดิม หรือเริ่มเปรียบเทียบใหม่" />;
  return <ResultView run={run} picks={picks} detail={detail} />;
}
