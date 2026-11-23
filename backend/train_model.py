"""Build the served model artifact (AgroMind v4, experiments/final_model.py) and print what it is.

    python train_model.py

Writes backend/models/v4_final.joblib (gitignored). The API loads it at startup and trains it in the
background if it is missing or older than the data. The v3 fallback model trains in memory at startup.
"""

from app.v4_service import ARTIFACT, V4Service


def main() -> None:
    v4 = V4Service()
    art = v4.train()
    print(f"Artifact : {ARTIFACT} ({v4.train_seconds} s)")
    print(f"Model    : {art['final']['name']}: {art['final']['description']}")
    print(f"Training : {len(art['data']):,} candidate rows, {art['data'].qid.nunique():,} queries, {len(art['crops'])} crops")
    print(f"Calibrate: T {art['T']:.3f}, 90% threshold {art['qhat']:.4f} (state-robust, beta {art['beta']}, "
          f"{art['n_cal_states']} states)")


if __name__ == "__main__":
    main()
