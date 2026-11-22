"""Train the district crop model on the large DES table and print its size and grouped metrics.

    python train_model.py

The API trains the same model in memory at startup (a few seconds), so running this is only a check.
"""

from app.v3_service import V3Service


def main() -> None:
    v3 = V3Service()
    v3.model  # trains
    info = v3.info()
    print(f"Rows     : {info['rows']:,} ({info['training_rows']:,} labelled)")
    print(f"Coverage : {info['states']} states, {info['districts']} districts ({info['locations']} locations), "
          f"years {info['years'][0]}-{info['years'][1]}, {info['crops']} crops")
    print(f"Trained  : {info['train_seconds']} s")
    for name, key in (("unseen districts", "leave_districts_out"), ("unseen states", "leave_states_out")):
        m = info["metrics"].get(key) or {}
        if m:
            print(f"{name:16s} hit@1 {m['hit1_mean']:.2%}  hit@3 {m['hit3_mean']:.2%}  (grouped CV, results.json)")
    m = info["metrics"].get("leave_years_out") or {}
    if m:
        print(f"future years     hit@1 {m['hit1']:.2%}  hit@3 {m['hit3']:.2%}  (train <=2014, test >=2015)")


if __name__ == "__main__":
    main()
