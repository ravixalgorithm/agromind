"""Build the served model artifact and print what it is.

    python train_model.py

Trains AgroMind v4 (YieldRank + 90 % conformal sets) on backend/data/large and writes
backend/models/v4_yieldrank.{txt,json}; the API loads that file at startup (and trains in the
background if it is missing or belongs to another build of the data). The v3 fallback model trains
in memory at startup in a few seconds, so it has no artifact.
"""

from app.v4_service import ARTIFACT, V4Service


def main() -> None:
    v4 = V4Service()
    m = v4.train(save=True)
    c = m["check"]
    print(f"Artifact : {ARTIFACT} ({m['train_seconds']} s)")
    print(f"Training : {m['rows']:,} candidate rows, {m['queries']:,} district-season-year queries, {len(m['crops'])} crops")
    print(f"Softmax T: {m['T']:.3f}   conformal 90% threshold: {m['qhat']:.4f}")
    print(f"Held-out : {c['queries']:,} queries  hit@1 {c['hit1']:.2%}  coverage {c['coverage']:.2%}  mean set size {c['set_size']:.2f}")


if __name__ == "__main__":
    main()
