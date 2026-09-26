#!/usr/bin/env python3
"""Check that every `file:line` citation in the sample report points at a real line.

Usage (from the repository root):
    python3 tools/check-citations.py [--show]

Prints any citation whose file is missing or whose line range is out of bounds,
and with --show prints the first lines of every distinct citation for eyeballing.
Exit status 1 if any problem was found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path("meadowlark")
REPORT = Path("report.md")

# Short names the report uses after giving the full path once.
ALIAS = {
    "BookingForm.tsx": "src/components/BookingForm.tsx",
    "Book.tsx": "src/pages/Book.tsx",
    "Manage.tsx": "src/pages/Manage.tsx",
    "Sessions.tsx": "src/pages/Sessions.tsx",
    "Customers.tsx": "src/pages/Customers.tsx",
    "Overview.tsx": "src/pages/admin/Overview.tsx",
    "App.tsx": "src/App.tsx",
    "admin.ts": "src/integrations/supabase/admin.ts",
    "openai.ts": "src/lib/openai.ts",
    "types.ts": "src/integrations/supabase/types.ts",
    "format.test.ts": "src/lib/format.test.ts",
    "init.sql": "supabase/migrations/20250611120000_init.sql",
    "20250611120000_init.sql": "supabase/migrations/20250611120000_init.sql",
    "20250618093000_manage_token.sql": "supabase/migrations/20250618093000_manage_token.sql",
    "20250702141500_waitlist.sql": "supabase/migrations/20250702141500_waitlist.sql",
    "20250709101200_fix_booking_insert.sql": "supabase/migrations/20250709101200_fix_booking_insert.sql",
    "20250715163000_lookup_customer.sql": "supabase/migrations/20250715163000_lookup_customer.sql",
    "schema-dump.sql": "supabase/schema-dump.sql",
    "config.toml": "supabase/config.toml",
    "build.yml": ".github/workflows/build.yml",
    "send-booking-confirmation/index.ts": "supabase/functions/send-booking-confirmation/index.ts",
    "session-reminders/index.ts": "supabase/functions/session-reminders/index.ts",
    "cancel-booking/index.ts": "supabase/functions/cancel-booking/index.ts",
}

PATTERN = re.compile(
    r"`((?:[A-Za-z0-9_./-]+/)?[A-Za-z0-9_.-]+\.(?:ts|tsx|sql|toml|yml|json|md)|\.env|\.gitignore):([0-9,\-]+)`"
)


def main(argv: list[str]) -> int:
    show = "--show" in argv
    text = REPORT.read_text(encoding="utf-8")
    problems = 0
    seen: set[tuple[str, int, int]] = set()
    for match in PATTERN.finditer(text):
        name, ranges = match.group(1), match.group(2)
        if name == "index.ts":
            # Three edge functions share this basename; the report must say which.
            print(f"AMBIGUOUS     {match.group(0)}")
            problems += 1
            continue
        rel = ALIAS.get(name, name)
        path = ROOT / rel
        if not path.exists():
            print(f"MISSING FILE  {match.group(0)}")
            problems += 1
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        for part in ranges.split(","):
            start_s, _, end_s = part.partition("-")
            start = int(start_s)
            end = int(end_s) if end_s else start
            if start < 1 or end > len(lines) or start > end:
                print(f"OUT OF RANGE  {match.group(0)}  (file has {len(lines)} lines)")
                problems += 1
                continue
            key = (rel, start, end)
            if key in seen:
                continue
            seen.add(key)
            if not show:
                continue
            print(f"{rel}:{part}")
            for i in range(start, min(end, start + 2) + 1):
                print(f"    {i:>4} {lines[i - 1][:110]}")
    print(f"distinct citations checked: {len(seen)}; problems: {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
