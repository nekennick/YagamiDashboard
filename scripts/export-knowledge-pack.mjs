import fs from "node:fs";

const sourcePath = "docs/knowledge/yagami-branch-warehouse-map.json";
const csvPath = "docs/knowledge/yagami-branches.csv";
const jsonlPath = "docs/knowledge/yagami-branches.jsonl";

const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const fields = [
  "warehouse",
  "day",
  "sourceCell",
  "rawName",
  "canonicalName",
  "customerCode",
  "status",
  "routeType",
  "notes",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const csv = [
  fields.join(","),
  ...data.branches.map((row) => fields.map((field) => csvEscape(row[field])).join(",")),
].join("\r\n");

const jsonl = data.branches
  .map((row) =>
    JSON.stringify({
      knowledge: "yagami-branch-warehouse-map",
      version: data.version,
      verifiedAt: data.verifiedAt,
      ...row,
    }),
  )
  .join("\n");

fs.writeFileSync(csvPath, `${csv}\r\n`, "utf8");
fs.writeFileSync(jsonlPath, `${jsonl}\n`, "utf8");

console.log(`Exported ${data.branches.length} branch records.`);
