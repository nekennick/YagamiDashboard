#!/usr/bin/env python3
"""Read-only SQLite query helper for Yagami Dashboard.

Examples:
  python query_yagami.py --db D:/github/YagamiDashboard/prisma/dev.db --sql "SELECT COUNT(*) FROM Invoice"
  python query_yagami.py --repo D:/github/YagamiDashboard --sql-file query.sql
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


def resolve_db(repo: str | None, db: str | None) -> Path:
    if db:
        return Path(db).expanduser().resolve()

    repo_path = Path(repo or os.getcwd()).resolve()
    env_path = repo_path / ".env"
    database_url = None

    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("DATABASE_URL="):
                database_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

    if database_url and database_url.startswith("file:"):
        raw = database_url.removeprefix("file:")
        path = Path(raw)
        if not path.is_absolute():
            path = repo_path / "prisma" / path
        return path.resolve()

    return (repo_path / "prisma" / "dev.db").resolve()


def assert_read_only(sql: str) -> None:
    compact = re.sub(r"\s+", " ", sql.strip()).lower()
    allowed = compact.startswith("select ") or compact.startswith("with ") or compact.startswith("pragma table_info")
    forbidden = re.search(r"\b(insert|update|delete|drop|alter|create|replace|vacuum|attach|detach|pragma\s+writable_schema)\b", compact)
    if not allowed or forbidden:
        raise SystemExit("Only read-only SELECT/WITH queries are allowed.")


def coerce(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=None, help="YagamiDashboard repo path")
    parser.add_argument("--db", default=None, help="SQLite database path")
    parser.add_argument("--sql", default=None, help="Read-only SQL query")
    parser.add_argument("--sql-file", default=None, help="File containing read-only SQL")
    parser.add_argument("--limit", type=int, default=200, help="Maximum rows to print")
    args = parser.parse_args()

    sql = args.sql
    if args.sql_file:
        sql = Path(args.sql_file).read_text(encoding="utf-8")
    if not sql:
        raise SystemExit("Provide --sql or --sql-file")

    assert_read_only(sql)
    db_path = resolve_db(args.repo, args.db)
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        cursor = connection.execute(sql)
        rows = cursor.fetchmany(args.limit)
        data = [{key: coerce(row[key]) for key in row.keys()} for row in rows]
        print(json.dumps({"db": str(db_path), "rowCount": len(data), "rows": data}, ensure_ascii=False, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    main()