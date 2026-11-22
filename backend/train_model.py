"""Train both crop models and print their metrics.

    python train_model.py            # v2: train only if no cached model matches the data
    python train_model.py --force    # v2: always retrain
v3 (district model on backend/data/large) is always trained in memory: it takes a few seconds,
and a joblib cache of it would be ~400 MB.
"""

import sys

from app.model_service import CropModelService
from app.v3_service import V3Service


def main() -> None:
    service = CropModelService()
    service.load_or_train()

    metrics = service.train() if "--force" in sys.argv else service.metrics
    meta = service.metadata

    print(f"Sources  : {meta['coverage']}")
    print(f"Rows     : {meta['rows']:,}")
    print(f"States   : {len(meta['options']['state'])}")
    print(f"Crops    : {len(meta['crops'])}")
    print(f"Accuracy : {metrics['accuracy']}")
    print(f"Top-3    : {metrics['top3_accuracy']}")
    print(f"Split    : {metrics['train_rows']:,} train / {metrics['test_rows']:,} test")

    v3 = V3Service()
    v3.model  # trains
    info = v3.info()
    print(f"\nv3 rows  : {info['rows']:,} ({info['training_rows']:,} labelled), {info['districts']} districts, "
          f"{info['states']} states, years {info['years'][0]}-{info['years'][1]}, {info['crops']} crops")
    print(f"v3 train : {info['train_seconds']} s")
    m = info["metrics"].get("leave_districts_out") or {}
    if m:
        print(f"v3 unseen districts: hit@1 {m['hit1_mean']:.2%}  hit@3 {m['hit3_mean']:.2%}  (grouped 5-fold, results.json)")


if __name__ == "__main__":
    main()
