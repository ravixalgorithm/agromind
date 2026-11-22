"""Train the crop model from the merged dataset and print its metrics.

    python train_model.py            # train only if no cached model matches the data
    python train_model.py --force    # always retrain
"""

import sys

from app.model_service import CropModelService


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


if __name__ == "__main__":
    main()
