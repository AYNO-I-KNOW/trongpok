import { expect, it } from "vitest";
import { parsePersonas, personaAnswers } from "./index";

it("reads a persona with quoted commas and question answers", () => {
  const rows = parsePersonas('persona_id,category,need_text,answers,labeler_a_top3,labeler_b_top3,human_top3,must_notes\np1,blender,"น้ำแข็ง,ผลไม้",use=ice|smoothie;budget=3000,a|b,a|b,a|b,"a: ไม่เหมาะ"\n');
  expect(rows).toHaveLength(1);
  expect(rows[0].need_text).toBe("น้ำแข็ง,ผลไม้");
  expect(personaAnswers(rows[0])).toEqual({ use: ["ice", "smoothie"], budget: ["3000"] });
});

it("rejects malformed headers, field counts, duplicate ids and answers", () => {
  const header = "persona_id,category,need_text,answers,labeler_a_top3,labeler_b_top3,human_top3,must_notes\n";
  const row = "p1,blender,ice,use=ice,a,a,a,\n";
  expect(() => parsePersonas("wrong\n")).toThrow("headers");
  expect(() => parsePersonas(header + "p1,blender\n")).toThrow("field count");
  expect(() => parsePersonas(header + row + row)).toThrow("Duplicate");
  expect(() => parsePersonas(header + row.replace("use=ice", "use"))).toThrow("answers");
});

it("uses need text when persona answers are empty", async () => {
  const { personaRequest } = await import("./index");
  const persona = parsePersonas("persona_id,category,need_text,answers,labeler_a_top3,labeler_b_top3,human_top3,must_notes\np1,blender,ice,,,,,\n")[0];
  expect(personaRequest(persona)).toEqual({ category: "blender", needText: "ice" });
});
