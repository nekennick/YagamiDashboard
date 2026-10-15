import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type CommitInfo = {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
};

export async function GET() {
  let commits: CommitInfo[] = [];

  // 1. Thử lấy commit trực tiếp từ Git nếu đang chạy môi trường phát triển có sẵn Git
  try {
    const output = execSync('git log --pretty=format:"%H|%h|%s|%an|%ad" --date=short -n 100', {
      encoding: "utf8"
    });
    const lines = output.trim().split("\n").filter(Boolean);
    commits = lines.map((line) => {
      const parts = line.split("|");
      return {
        hash: parts[0]?.trim() || "",
        shortHash: parts[1]?.trim() || "",
        message: parts[2]?.trim() || "",
        author: parts[3]?.trim() || "",
        date: parts[4]?.trim() || ""
      };
    });
  } catch {
    // 2. Nếu không có Git (ví dụ chạy trong Docker Container), đọc từ file JSON tĩnh đã đóng gói
    try {
      const jsonPath = path.join(process.cwd(), "lib", "changelog-data.json");
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, "utf8");
        commits = JSON.parse(raw);
      }
    } catch (readError) {
      console.warn("Không thể đọc changelog-data.json:", readError);
    }
  }

  const latestHash = commits[0]?.hash || "";

  return NextResponse.json({
    latestHash,
    totalCommits: commits.length,
    commits
  });
}
