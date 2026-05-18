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
        "tracts":         ["CUSEC", "CUMUN", "CPRO", "NMUN"],
        "municipalities": ["CUMUN", "CPRO", "NMUN"],
        "provinces":      ["CPRO", "province_name"],
    }

    for level, gdf in levels.items():
        cols = ["geometry"] + id_cols[level]
        out = gdf[[c for c in cols if c in gdf.columns]]
        path = os.path.join(output_dir, f"{level}.geojson")
        out.to_file(path, driver="GeoJSON")
        size_kb = os.path.getsize(path) / 1000
        print(f"  [exported] {level}.geojson — {len(out):,} features · {size_kb:.0f} KB")

    # catalonia outline — single polygon for minimap
    catalonia = levels["provinces"].dissolve().reset_index()[["geometry"]]
    catalonia["geometry"] = catalonia["geometry"].simplify(0.005, preserve_topology=True)
    path = os.path.join(output_dir, "catalonia.geojson")
    catalonia.to_file(path, driver="GeoJSON")
    print(f"  [exported] catalonia.geojson — outline only")

def export_data(data: dict, output_dir: str) -> None:
    """
    Export variable data as JSON lookup tables.
    One file per geographic level.
    """
    os.makedirs(output_dir, exist_ok=True)

    for level, lookup in data.items():
        path = os.path.join(output_dir, f"{level}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(lookup, f, ensure_ascii=False)
        size_kb = os.path.getsize(path) / 1000
        print(f"  [exported] {level}.json — {len(lookup):,} areas · {size_kb:.0f} KB")
