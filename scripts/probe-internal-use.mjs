import { readFile } from "node:fs/promises";

const raw = (await readFile("/run/secrets/kiotviet_internal_requests", "utf8")).replace(/\^\r?\n/g, " ").replace(/\^/g, "");
const block = raw.split(/(?:^|\r?\n)\s*curl\s+/i).find((item) => item.includes("/api/stocktakes/list")) ?? "";
const url = block.match(/"(https:\/\/[^"\s]+)\/api\/stocktakes\/list"/i)?.[1];
if (!url) throw new Error("Không đọc được máy chủ KiotViet.");
const allowed = new Set(["accept", "authorization", "branchid", "content-type", "fingerprintkey", "isusekvclient", "origin", "referer", "retailer", "x-group-id", "x-language", "x-retailer-code"]);
const headers = {};
for (const match of block.matchAll(/-H\s+"([^:"]+):\s*([^"]*)"/gi)) {
  if (allowed.has(match[1].toLowerCase())) headers[match[1].toLowerCase()] = match[2].trim();
}

const response = await fetch(`${url}/api/internaluses/list`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ format: "json", Includes: ["Branch"], CodeKey: "XD000059", $inlinecount: "allpages", $format: "json", $filter: "", $top: 20, $skip: 0 })
});
const result = await response.json();
const first = Array.isArray(result.Data) ? result.Data[0] : null;
console.log(`LIST ${response.status} total=${result.Total} keys=${first ? Object.keys(first).join(",") : ""}`);
if (!first) process.exit(0);
console.log(`DOCUMENT id=${first.Id} code=${first.Code} branch=${first.BranchId} date=${first.CreatedDate ?? first.UseDate ?? first.ModifiedDate} status=${first.Status}`);
for (const path of [`/api/internaluses/${first.Id}/details?format=json&Includes=Product&isFilter=true`, `/api/internaluses/${first.Id}/detailsupdate?isShowPopup=true`]) {
  const detailsResponse = await fetch(`${url}${path}`, { headers: { ...headers, "content-type": "application/json" } });
  const raw = await detailsResponse.text();
  try {
    const details = JSON.parse(raw);
    const lines = details.Data ?? details.data ?? details.Items ?? details.items ?? [];
    const line = Array.isArray(lines) ? lines[0] : null;
    console.log(`DETAIL ${path.split("?")[0]} ${detailsResponse.status} keys=${line ? Object.keys(line).join(",") : Object.keys(details).join(",")}`);
  } catch {
    console.log(`DETAIL ${path.split("?")[0]} ${detailsResponse.status} ${raw.slice(0, 80)}`);
  }
}
