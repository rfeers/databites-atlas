import os
import yaml
from core.geometry import get_catalonia_geometries, make_levels
from core.export import export_geo

def load_config():
    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)

def main():
    cfg = load_config()
    geo_dir  = os.path.normpath(os.path.join(os.path.dirname(__file__), cfg["output"]["geo_dir"]))
    data_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), cfg["output"]["data_dir"]))

    print("\n── Geometry ──────────────────────────")
    gdf    = get_catalonia_geometries(cfg)
    levels = make_levels(gdf, cfg)
    export_geo(levels, geo_dir)

    print("\n✓ Done. Files written to:")
    print(f"  {geo_dir}/")
    print(f"  {data_dir}/  ← variables coming in Milestone 3")

if __name__ == "__main__":
    main()