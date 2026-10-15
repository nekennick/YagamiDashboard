import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const targetPath = path.join(process.cwd(), "lib", "changelog-data.json");

try {
  const output = execSync('git log --pretty=format:"%H|%h|%s|%an|%ad" --date=short -n 200', {
    encoding: "utf8"
  });

  const lines = output.trim().split("\n").filter(Boolean);
  const commits = lines.map((line) => {
    const parts = line.split("|");
    const hash = parts[0]?.trim() || "";
    const shortHash = parts[1]?.trim() || "";
    const message = parts[2]?.trim() || "";
    const author = parts[3]?.trim() || "";
    const date = parts[4]?.trim() || "";
    return {
      hash,
      shortHash,
      message,
      author,
      date
    };
  });

  fs.writeFileSync(targetPath, JSON.stringify(commits, null, 2), "utf8");
  console.log(`✅ Đã xuất thành công ${commits.length} bản ghi cập nhật vào lib/changelog-data.json`);
} catch (error) {
  console.warn("⚠️ Không thể trích xuất git log:", error.message);
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, JSON.stringify([], null, 2), "utf8");
  }
}
