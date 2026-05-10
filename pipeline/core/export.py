import os
import json
import geopandas as gpd

def export_geo(levels: dict, output_dir: str) -> None:
    """
    Export geometry-only GeoJSON files for each level.
    These files contain NO variable data — just shape + ID columns.
    """
    os.makedirs(output_dir, exist_ok=True)

    id_cols = {
        "tracts":         ["CUSEC", "CUMUN", "CPRO"],
        "municipalities": ["CUMUN", "CPRO"],
        "provinces":      ["CPRO", "province_name"],
    }

    for level, gdf in levels.items():
        cols = ["geometry"] + id_cols[level]
        out = gdf[[c for c in cols if c in gdf.columns]]
        path = os.path.join(output_dir, f"{level}.geojson")
        out.to_file(path, driver="GeoJSON")
        size_kb = os.path.getsize(path) / 1000
        print(f"  [exported] {level}.geojson — {len(out):,} features · {size_kb:.0f} KB")