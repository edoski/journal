#!/usr/bin/env python3
"""
Toggle Flow skip automation on/off.

Usage:
    python -m utils.toggle_flow_skip        # Toggle current state
    python -m utils.toggle_flow_skip on     # Force enable
    python -m utils.toggle_flow_skip off    # Force disable
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "skip_schedule.json"


def load_config() -> dict:
    """Load the skip schedule configuration."""
    if not CONFIG_PATH.exists():
        return {"enabled": False, "skip_times": []}
    with open(CONFIG_PATH) as f:
        return json.load(f)


def save_config(config: dict) -> None:
    """Save the skip schedule configuration."""
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")


def main() -> int:
    """Toggle or set the enabled state."""
    config = load_config()
    current = config.get("enabled", False)

    # Determine new state
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == "on":
            new_state = True
        elif arg == "off":
            new_state = False
        else:
            print(f"Unknown argument: {arg}")
            print("Usage: toggle_flow_skip [on|off]")
            return 1
    else:
        new_state = not current

    # Update and save
    config["enabled"] = new_state
    save_config(config)

    status = "✅ ENABLED" if new_state else "❌ DISABLED"
    print(f"Flow skip automation: {status}")
    print(f"Skip times: {', '.join(config.get('skip_times', []))}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
