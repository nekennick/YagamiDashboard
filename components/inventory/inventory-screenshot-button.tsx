"use client";

import { useState } from "react";
import { Camera, Check, LoaderCircle } from "lucide-react";

export type InventoryScreenshotRow = {
  index: number;
  groupName: string;
  productName: string;
  unit: string;
  branchName: string;
  onHand: string;
  onHandValue: number;
  reserved: string;
  actualReserved: string;
};

type InventoryScreenshotButtonProps = {
  rows: InventoryScreenshotRow[];
  snapshotLabel: string;
};

const imageWidth = 1800;
const titleHeight = 104;
const headerHeight = 58;
const rowHeight = 42;
const footerHeight = 36;
const imageScale = 1.5;

const columns = [
  { key: "index", label: "STT", width: 70, align: "center" },
  { key: "groupName", label: "Nhóm hàng", width: 220, align: "left" },
  { key: "productName", label: "Sản phẩm", width: 450, align: "left" },
  { key: "unit", label: "ĐVT", width: 90, align: "center" },
  { key: "branchName", label: "Chi nhánh", width: 290, align: "left" },
  { key: "onHand", label: "Tồn", width: 150, align: "right" },
  { key: "reserved", label: "Đặt giữ", width: 150, align: "right" },
  { key: "actualReserved", label: "Giữ thực tế", width: 170, align: "right" },
  { key: "status", label: "Tình trạng", width: 180, align: "center" }
] as const;

export function InventoryScreenshotButton({ rows, snapshotLabel }: InventoryScreenshotButtonProps) {
  const [state, setState] = useState<"idle" | "capturing" | "complete" | "error">("idle");

  async function captureInventory() {
    if (state === "capturing" || rows.length === 0) return;

    setState("capturing");

    try {
      if (document.fonts?.ready) await document.fonts.ready;

      const imageHeight = titleHeight + headerHeight + rows.length * rowHeight + footerHeight;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(imageWidth * imageScale);
      canvas.height = Math.round(imageHeight * imageScale);

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không hỗ trợ Canvas 2D.");

      context.scale(imageScale, imageScale);
      context.textBaseline = "middle";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, imageWidth, imageHeight);

      drawTitle(context, rows.length, snapshotLabel);
      drawHeader(context);
      drawRows(context, rows);

      const blob = await canvasToBlob(canvas);
      await copyToClipboard(blob);

      setState("complete");
      window.setTimeout(() => setState("idle"), 2400);
    } catch (error) {
      console.error("Không thể chụp bảng tồn kho", error);
      setState("error");
      window.setTimeout(() => setState("idle"), 3200);
    }
  }

  return (
    <button
      aria-label="Chụp ảnh bảng tồn kho"
      aria-live="polite"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      disabled={state === "capturing" || rows.length === 0}
      onClick={captureInventory}
      type="button"
    >
      {state === "capturing" ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : state === "complete" ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <Camera className="h-4 w-4" />
      )}
      {state === "capturing"
        ? "Đang tạo ảnh..."
        : state === "complete"
          ? "Đã sao chép"
          : state === "error"
            ? "Thử chụp lại"
            : "Sao chép ảnh"}
    </button>
  );
}

function drawTitle(context: CanvasRenderingContext2D, rowCount: number, snapshotLabel: string) {
  context.fillStyle = "#0f172a";
  context.fillRect(0, 0, imageWidth, titleHeight);

  context.fillStyle = "#ffffff";
  context.font = "700 30px Segoe UI, Arial, sans-serif";
  context.fillText("BẢNG TỒN KHO", 30, 39);

  context.fillStyle = "#cbd5e1";
  context.font = "400 17px Segoe UI, Arial, sans-serif";
  context.fillText(`${snapshotLabel}  •  ${rowCount} dòng dữ liệu`, 30, 76);
}

function drawHeader(context: CanvasRenderingContext2D) {
  let x = 0;
  const y = titleHeight;

  context.fillStyle = "#e2e8f0";
  context.fillRect(0, y, imageWidth, headerHeight);
  context.font = "700 17px Segoe UI, Arial, sans-serif";

  for (const column of columns) {
    drawCellText(context, column.label, x, y, column.width, headerHeight, column.align, "#334155");
    drawVerticalLine(context, x + column.width, y, y + headerHeight, "#cbd5e1");
    x += column.width;
  }

  drawHorizontalLine(context, y + headerHeight, "#94a3b8");
}

function drawRows(context: CanvasRenderingContext2D, rows: InventoryScreenshotRow[]) {
  let previousGroup = "";

  rows.forEach((row, rowIndex) => {
    const y = titleHeight + headerHeight + rowIndex * rowHeight;
    const status = stockStatus(row.onHandValue);
    const values = {
      ...row,
      groupName: row.groupName === previousGroup ? "" : row.groupName,
      status: status.label
    };

    context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    context.fillRect(0, y, imageWidth, rowHeight);

    let x = 0;
    for (const column of columns) {
      const value = String(values[column.key]);

      if (column.key === "status") {
        drawStatus(context, value, status.background, status.foreground, x, y, column.width, rowHeight);
      } else {
        drawCellText(
          context,
          value,
          x,
          y,
          column.width,
          rowHeight,
          column.align,
          column.key === "productName" ? "#0f172a" : "#334155",
          column.key === "productName" || column.key === "onHand" ? 600 : 400
        );
      }

      drawVerticalLine(context, x + column.width, y, y + rowHeight, "#e2e8f0");
      x += column.width;
    }

    drawHorizontalLine(context, y + rowHeight, "#e2e8f0");
    previousGroup = row.groupName;
  });
}

function drawCellText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: "left" | "center" | "right",
  color: string,
  weight = 400
) {
  const padding = 14;
  context.save();
  context.beginPath();
  context.rect(x + 1, y + 1, width - 2, height - 2);
  context.clip();
  context.fillStyle = color;
  context.font = `${weight} 16px Segoe UI, Arial, sans-serif`;
  context.textAlign = align;

  const availableWidth = width - padding * 2;
  const clippedText = truncateText(context, text, availableWidth);
  const textX = align === "left" ? x + padding : align === "right" ? x + width - padding : x + width / 2;
  context.fillText(clippedText, textX, y + height / 2);
  context.restore();
}

function drawStatus(
  context: CanvasRenderingContext2D,
  label: string,
  background: string,
  foreground: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.font = "600 15px Segoe UI, Arial, sans-serif";
  const pillWidth = Math.min(width - 20, context.measureText(label).width + 28);
  const pillHeight = 28;
  const pillX = x + (width - pillWidth) / 2;
  const pillY = y + (height - pillHeight) / 2;

  context.fillStyle = background;
  roundedRect(context, pillX, pillY, pillWidth, pillHeight, 7);
  context.fill();
  context.fillStyle = foreground;
  context.textAlign = "center";
  context.fillText(label, x + width / 2, y + height / 2);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function truncateText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}…`;
}

function drawVerticalLine(context: CanvasRenderingContext2D, x: number, top: number, bottom: number, color: string) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.moveTo(x + 0.5, top);
  context.lineTo(x + 0.5, bottom);
  context.stroke();
}

function drawHorizontalLine(context: CanvasRenderingContext2D, y: number, color: string) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.moveTo(0, y + 0.5);
  context.lineTo(imageWidth, y + 0.5);
  context.stroke();
}

function stockStatus(onHand: number) {
  if (onHand < 0) return { label: "Tồn âm", background: "#fee2e2", foreground: "#b91c1c" };
  if (onHand === 0) return { label: "Hết hàng", background: "#e2e8f0", foreground: "#475569" };
  if (onHand <= 10) return { label: "Tồn thấp", background: "#fef3c7", foreground: "#b45309" };
  return { label: "Còn hàng", background: "#d1fae5", foreground: "#047857" };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Không thể tạo file PNG."));
    }, "image/png");
  });
}

async function copyToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Trình duyệt không hỗ trợ sao chép ảnh vào clipboard.");
  }

  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
