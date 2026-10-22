#!/usr/bin/env python3
"""Validate the static site before it is published.

Validates data/changelog.json against the JSON Schema and performs
cross-field validation. Also checks that index.html only references
files that exist.
"""
import json
import re
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker
    from jsonschema.exceptions import ValidationError
except ImportError:
    sys.exit("Error: jsonschema package required. Install with: pip install jsonschema")

ROOT = Path(__file__).resolve().parent.parent
errors = []


def err(msg):
    errors.append(msg)


def format_path(path):
    """Convert a JSON Schema path to a human-readable string."""
    parts = []
    for p in path:
        if isinstance(p, int):
            parts.append(f"[{p}]")
        else:
            if parts:
                parts.append(f".{p}")
            else:
                parts.append(p)
    return "".join(parts) if parts else "(root)"


def identify_entry(data, path):
    """Return a human-readable identifier for the entry at the given path."""
    if len(path) >= 2:
        section = path[0]
        index = path[1] if isinstance(path[1], int) else None
        if section == "releases" and index is not None:
            releases = data.get("releases", [])
            if index < len(releases):
                r = releases[index]
                version = r.get("version", "?")
                return f"releases[{index}] (version {version})"
        elif section == "incidents" and index is not None:
            incidents = data.get("incidents", [])
            if index < len(incidents):
                i = incidents[index]
                title = i.get("title", "?")
                return f"incidents[{index}] ('{title}')"
        elif section == "components" and index is not None:
            components = data.get("components", [])
            if index < len(components):
                c = components[index]
                name = c.get("name", c.get("id", "?"))
                return f"components[{index}] ('{name}')"
    return format_path(path)


def validate_changelog():
    data_path = ROOT / "data" / "changelog.json"
    schema_path = ROOT / "data" / "changelog.schema.json"

    try:
        data = json.loads(data_path.read_text())
    except OSError as exc:
        err(f"Cannot read data/changelog.json: {exc}")
        return
    except json.JSONDecodeError as exc:
        err(f"data/changelog.json is not valid JSON: {exc}")
        return

    try:
        schema = json.loads(schema_path.read_text())
    except OSError as exc:
        err(f"Cannot read data/changelog.schema.json: {exc}")
        return
    except json.JSONDecodeError as exc:
        err(f"data/changelog.schema.json is not valid JSON: {exc}")
        return

    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = list(error.absolute_path)
        entry_id = identify_entry(data, path)
        field = path[-1] if path else "(root)"

        if "is a required property" in error.message:
            field_name = error.message.split("'")[1]
            err(f"{entry_id}: missing required field '{field_name}'")
        elif "is not one of" in error.message:
            err(f"{entry_id}.{field}: {error.message}")
        elif "does not match" in error.message:
            err(f"{entry_id}.{field}: {error.message}")
        elif "is not valid under any of the given schemas" in error.message:
            continue
        else:
            location = f"{entry_id}.{field}" if path else entry_id
            err(f"{location}: {error.message}")

    if errors:
        return

    component_ids = {c.get("id") for c in data.get("components", [])}
    seen_versions = set()
    for i, r in enumerate(data.get("releases", [])):
        v = r.get("version")
        if v in seen_versions:
            err(f"releases[{i}] (version {v}): duplicate version '{v}'")
        seen_versions.add(v)

    seen_component_ids = set()
    for i, c in enumerate(data.get("components", [])):
        cid = c.get("id")
        if cid in seen_component_ids:
            err(f"components[{i}] ('{c.get('name', cid)}'): duplicate id '{cid}'")
        seen_component_ids.add(cid)

    for i, inc in enumerate(data.get("incidents", [])):
        for cid in inc.get("affected", []):
            if cid not in component_ids:
                title = inc.get("title", "?")
                err(f"incidents[{i}] ('{title}'): affected component '{cid}' does not exist")


def check_html():
    html_path = ROOT / "index.html"
    try:
        html = html_path.read_text()
    except OSError as exc:
        err(f"Cannot read index.html: {exc}")
        return

    for ref in re.findall(r'(?:src|href)="([^"#?]+)"', html):
        if ref.startswith(("http://", "https://", "mailto:", "./")) or ref == "/":
            continue
        if not (ROOT / ref).exists():
            err(f"index.html references missing file '{ref}'")


validate_changelog()
check_html()

if errors:
    print("Validation failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print("Validation passed: changelog.json matches schema and index.html looks good.")
