#!/usr/bin/env python3
"""Validate the static site before it is published.

Checks data/changelog.json against the shape app.js expects and makes
sure index.html only references files that exist. No dependencies.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []


def err(msg):
    errors.append(msg)


def check_date(value, where):
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        err(f"{where}: '{value}' is not an ISO date")


def check_changelog():
    path = ROOT / "data" / "changelog.json"
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        err(f"data/changelog.json: {exc}")
        return

    for key in ("product", "status", "components", "releases", "incidents"):
        if key not in data:
            err(f"changelog: missing top-level key '{key}'")
    if errors:
        return

    product = data["product"]
    for key in ("name", "tagline", "uptime_90d", "updated_at"):
        if key not in product:
            err(f"product: missing '{key}'")
    if not isinstance(product.get("uptime_90d"), (int, float)) or not 0 <= product.get("uptime_90d", -1) <= 100:
        err("product.uptime_90d must be a number between 0 and 100")
    check_date(product.get("updated_at"), "product.updated_at")

    levels = {"operational", "degraded", "outage"}
    if data["status"].get("level") not in levels:
        err(f"status.level must be one of {sorted(levels)}")

    ids = set()
    for i, c in enumerate(data["components"]):
        where = f"components[{i}]"
        for key in ("id", "name", "level"):
            if key not in c:
                err(f"{where}: missing '{key}'")
        if c.get("id") in ids:
            err(f"{where}: duplicate id '{c.get('id')}'")
        ids.add(c.get("id"))
        if c.get("level") not in levels:
            err(f"{where}: level must be one of {sorted(levels)}")
        for d in c.get("incident_days", []):
            check_date(d, f"{where}.incident_days")

    versions = set()
    for i, r in enumerate(data["releases"]):
        where = f"releases[{i}]"
        for key in ("version", "date", "title"):
            if key not in r:
                err(f"{where}: missing '{key}'")
        if r.get("version") in versions:
            err(f"{where}: duplicate version '{r.get('version')}'")
        versions.add(r.get("version"))
        check_date(r.get("date"), f"{where}.date")

    impacts = {"degraded", "outage"}
    for i, inc in enumerate(data["incidents"]):
        where = f"incidents[{i}]"
        for key in ("title", "impact", "started_at"):
            if key not in inc:
                err(f"{where}: missing '{key}'")
        if inc.get("impact") not in impacts:
            err(f"{where}: impact must be one of {sorted(impacts)}")
        check_date(inc.get("started_at"), f"{where}.started_at")
        if inc.get("resolved_at"):
            check_date(inc["resolved_at"], f"{where}.resolved_at")
        for cid in inc.get("affected", []):
            if cid not in ids:
                err(f"{where}: affected component '{cid}' does not exist")


def check_html():
    html = (ROOT / "index.html").read_text()
    for ref in re.findall(r'(?:src|href)="([^"#?]+)"', html):
        if ref.startswith(("http://", "https://", "mailto:", "./")) or ref == "/":
            continue
        if not (ROOT / ref).exists():
            err(f"index.html references missing file '{ref}'")


check_changelog()
check_html()

if errors:
    print("Validation failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print("Validation passed: changelog.json and index.html look good.")
