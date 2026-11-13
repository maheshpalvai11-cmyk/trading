from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.data.market_data import generate_demo_data

destination = Path(__file__).resolve().parents[1] / "data" / "demo_ohlcv.csv"
destination.parent.mkdir(parents=True, exist_ok=True)
generate_demo_data().to_csv(destination, index=False)
print(f"Wrote {destination}")
