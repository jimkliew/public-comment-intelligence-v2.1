#!/usr/bin/env python3
"""Run the Public Comment Intelligence analysis pipeline.

Usage:
    python run_pipeline.py                                    # Default docket, 500 comments, classify 50
    python run_pipeline.py EPA-HQ-OAR-2021-0208               # Specific docket
    python run_pipeline.py EPA-HQ-OAR-2021-0208 1000 100      # 1000 comments, classify 100
    python run_pipeline.py --eval                              # Run eval only
"""

import sys
import os
import asyncio

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))


def main():
    if "--eval" in sys.argv:
        from evals.golden_set import run_eval
        run_eval()
        return

    from analysis.pipeline import run_full_pipeline

    docket = sys.argv[1] if len(sys.argv) > 1 else "EPA-HQ-OW-2022-0114"
    max_comments = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    classify_limit = int(sys.argv[3]) if len(sys.argv) > 3 else 0  # 0 = classify ALL

    print(f"Public Comment Intelligence v2.1 — Full Pipeline")
    print(f"  Docket: {docket}")
    print(f"  Max comments: {max_comments}")
    print(f"  Classify limit: {'ALL' if classify_limit == 0 else classify_limit}")
    print()

    asyncio.run(run_full_pipeline(
        docket_id=docket,
        max_comments=max_comments,
        classify_limit=classify_limit,
        output_dir=os.path.join(os.path.dirname(__file__), "backend", "data"),
    ))


if __name__ == "__main__":
    main()
