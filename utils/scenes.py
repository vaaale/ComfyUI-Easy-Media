from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import folder_paths

from .h3_project import safe_h3_project_name

safe_scene_name = safe_h3_project_name


def _scenes_directory() -> Path:
    directory = Path(folder_paths.get_output_directory()).resolve() / "easy_media" / "scenes"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def list_scenes() -> list[str]:
    """Return saved scene names (without the .json extension), 'default' first."""
    directory = _scenes_directory()
    names = {
        path.stem for path in directory.glob("*.json") if path.is_file()
    }
    names.add("default")
    return ["default", *sorted(name for name in names if name != "default")]


def save_scene(name: str, track_data: dict[str, Any]) -> str:
    """Save track_data under a sanitized scene name, overwriting any existing file."""
    safe_name = safe_scene_name(name)
    path = _scenes_directory() / f"{safe_name}.json"
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        temporary.write_text(
            json.dumps(track_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(path)
    except (OSError, TypeError, ValueError) as error:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to save scene {safe_name!r}: {error}") from error
    return safe_name


def load_scene(name: str) -> dict[str, Any]:
    """Load a previously saved scene's track_data."""
    safe_name = safe_scene_name(name)
    path = _scenes_directory() / f"{safe_name}.json"
    if not path.is_file():
        raise FileNotFoundError(f"Scene not found: {safe_name}")
    return json.loads(path.read_text(encoding="utf-8"))


def delete_scene(name: str) -> bool:
    """Delete a saved scene file if it exists. Returns whether a file was removed."""
    safe_name = safe_scene_name(name)
    path = _scenes_directory() / f"{safe_name}.json"
    if not path.is_file():
        return False
    path.unlink()
    return True
