"""Write the API's OpenAPI schema to frontend/src/generated/openapi.json.

The frontend's response types are generated from it (`npm run gen:api` in
frontend/), so a schema change that isn't regenerated fails CI. Run from
backend/:

    .venv/bin/python scripts/export_openapi.py
"""

import json
import os
import pathlib
import sys

# The app refuses to import without these; exporting the schema uses neither.
os.environ.setdefault("SECRET_KEY", "openapi-export")
os.environ.setdefault("ENCRYPTION_KEY", "Zb0p3QqgWVSYcO2t4Ywq3C2yPF4QO7sGzsG0Wq2T3cE=")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "generated" / "openapi.json"
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
print(f"Wrote {OUT.relative_to(OUT.parents[3])}")
