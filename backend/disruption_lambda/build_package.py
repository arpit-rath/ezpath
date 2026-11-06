"""Build the dependency-free disruption Lambda ZIP staging directory."""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / ".build" / "disruption_lambda"


def build(output: Path = DEFAULT_OUTPUT) -> Path:
    output = output.resolve()
    build_root = (ROOT / ".build").resolve()
    if output.parent != build_root:
        raise ValueError(f"output must be a direct child of {build_root}")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name in ("handler.py", "repository.py"):
        shutil.copy2(SOURCE / name, output / name)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    package = build(args.output)
    print(f"Built disruption Lambda package: {package}")


if __name__ == "__main__":
    main()
