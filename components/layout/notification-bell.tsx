"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Sparkles,
  GitCommit,
  Calendar,
  Search,
  X,
  CheckCheck,
  History,
  Layers
} from "lucide-react";

type CommitItem = {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
};

const STORAGE_KEY = "yagami_last_seen_commit";

export function NotificationBell() {
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Khóa scroll khi mở modal
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  // Lấy dữ liệu changelog từ API
  useEffect(() => {
    async function loadChangelog() {
      try {
        const response = await fetch("/api/changelog");
        if (!response.ok) return;
        const data = (await response.json()) as {
          latestHash: string;
          commits: CommitItem[];
        };

        if (Array.isArray(data.commits) && data.commits.length > 0) {
          setCommits(data.commits);
          const lastSeen = localStorage.getItem(STORAGE_KEY);
          if (data.latestHash && data.latestHash !== lastSeen) {
            setHasNewUpdate(true);
          }
        }
      } catch (error) {
        console.warn("Không thể tải thông tin cập nhật:", error);
      }
    }

    void loadChangelog();
  }, []);

  // Đóng popover khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Đánh dấu đã đọc khi mở popover
  function handleOpenPopover() {
    setIsOpen((prev) => !prev);
    if (commits.length > 0 && commits[0]?.hash) {
      localStorage.setItem(STORAGE_KEY, commits[0].hash);
      setHasNewUpdate(false);
    }
  }

  function handleMarkAllRead() {
    if (commits.length > 0 && commits[0]?.hash) {
      localStorage.setItem(STORAGE_KEY, commits[0].hash);
    }
    setHasNewUpdate(false);
  }

  // Lọc commit trong Modal theo từ khóa
  const filteredCommits = useMemo(() => {
    if (!searchTerm.trim()) return commits;
    const term = searchTerm.toLowerCase();
    return commits.filter(
      (c) =>
        c.message.toLowerCase().includes(term) ||
        c.date.includes(term) ||
        c.shortHash.toLowerCase().includes(term)
    );
  }, [commits, searchTerm]);

  const recentCommits = commits.slice(0, 5);

  return (
    <div className="relative" ref={popoverRef}>
      {/* NÚT ICON CHUÔNG */}
      <button
        onClick={handleOpenPopover}
        type="button"
        title="Thông báo cập nhật hệ thống"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white lg:h-11 lg:w-11"
        aria-label="Thông báo cập nhật"
      >
        <Bell className="h-5 w-5" />

        {/* Đèn báo có cập nhật mới (sáng nhấp nháy) */}
        {hasNewUpdate && (
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900"></span>
          </span>
        )}
      </button>

      {/* DROPDOWN POPOVER GẦN ĐÂY */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl z-50 dark:border-gray-800 dark:bg-gray-900 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Popover */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Bản cập nhật mới
              </h3>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                {commits.length}
              </span>
            </div>
            <button
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Đã đọc
            </button>
          </div>

          {/* Danh sách 5 cập nhật mới nhất */}
          <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800/60 max-h-[340px] overflow-y-auto no-scrollbar">
            {recentCommits.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">
                Chưa có lịch sử cập nhật.
              </div>
            ) : (
              recentCommits.map((item, index) => (
                <div key={item.hash || index} className="py-2.5 first:pt-1 last:pb-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.date}
                    </span>
                    <span>•</span>
                    {/* Mã commit dạng văn bản thuần túy, hoàn toàn không có link GitHub */}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      {item.shortHash}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Nút Xem tất cả để mở Modal */}
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <button
              onClick={() => {
                setIsOpen(false);
                setIsModalOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80"
            >
              <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Xem tất cả lịch sử ({commits.length} bản ghi)
            </button>
          </div>
        </div>
      )}

      {/* MODAL XEM TOÀN BỘ LỊCH SỬ COMMIT */}
      {isModalOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(e) => {
                if (e.target === e.currentTarget) setIsModalOpen(false);
              }}
            >
              <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900 dark:text-white">
                        Toàn bộ lịch sử thay đổi & cập nhật
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Tổng cộng {commits.length} phiên bản đã được cập nhật trên hệ thống.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    aria-label="Đóng"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Modal Search Bar */}
                <div className="border-b border-gray-100 px-6 py-3 dark:border-gray-800">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm kiếm nội dung cập nhật, ngày tháng, mã commit..."
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-10 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-blue-500"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Modal Timeline List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {filteredCommits.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Không tìm thấy bản cập nhật nào khớp với từ khóa &ldquo;{searchTerm}&rdquo;.
                      </p>
                    </div>
                  ) : (
                    filteredCommits.map((item, index) => (
                      <div
                        key={item.hash || index}
                        className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50/40 p-4 transition-all hover:border-gray-200 hover:bg-white dark:border-gray-800/80 dark:bg-gray-800/20 dark:hover:border-gray-700 dark:hover:bg-gray-800/50"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                          <GitCommit className="h-4 w-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                            {item.message}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                              <Calendar className="h-3.5 w-3.5" />
                              {item.date}
                            </span>
                            <span>•</span>
                            {/* Hiển thị văn bản thuần, không có thẻ <a> link sang GitHub */}
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {item.shortHash}
                            </span>
                            {item.author && (
                              <>
                                <span>•</span>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                  {item.author}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3.5 dark:border-gray-800">
                  <span className="text-xs text-gray-400">
                    Hiển thị {filteredCommits.length} / {commits.length} bản ghi
                  </span>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
