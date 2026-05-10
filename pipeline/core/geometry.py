import io
import os
import shutil
import zipfile
import geopandas as gpd
from .download import download

TMP_DIR = os.path.join(os.path.dirname(__file__), "..", ".tmp")

def get_catalonia_geometries(cfg: dict, force: bool = False) -> gpd.GeoDataFrame:
    """
    Download the INE census tract boundaries for all of Spain,
    filter to Catalonia's provinces, and return a GeoDataFrame.
    """
    url = cfg["geometry"]["url"]
    province_codes = cfg["region"]["province_codes"]

    # Download the zip
    raw = download(url, "INE seccionado boundaries", force)

    # Extract to temp dir
    if os.path.exists(TMP_DIR):
        shutil.rmtree(TMP_DIR)
    os.makedirs(TMP_DIR)
    zipfile.ZipFile(io.BytesIO(raw)).extractall(TMP_DIR)

    # Find the .shp file inside
    shp_file = None
    for root, dirs, files in os.walk(TMP_DIR):
        for f in files:
            if f.endswith(".shp"):
                shp_file = os.path.join(root, f)
                break

    if not shp_file:
        raise FileNotFoundError("No .shp file found in INE zip")

    print(f"  [read] {shp_file}")
    gdf = gpd.read_file(shp_file)
    print(f"  [loaded] {len(gdf):,} total tracts in Spain")

    # Uppercase only non-geometry columns, then rename geometry explicitly
    gdf.columns = [c.upper() if c.lower() != "geometry" else "geometry" for c in gdf.columns]
    if "CUSEC" not in gdf.columns:
        raise ValueError(f"CUSEC column not found. Columns: {list(gdf.columns)}")

    # Filter to Catalonia using province code (first 2 digits of CUSEC)
    gdf = gdf[gdf["CUSEC"].str[:2].isin(province_codes)].copy()
    print(f"  [filtered] {len(gdf):,} tracts in Catalonia")

    # Reproject to WGS84 (longitude/latitude) — required by MapLibre
    gdf = gdf.to_crs(epsg=4326)

    # Add derived columns
    gdf["CUMUN"] = gdf["CUSEC"].str[:5]   # municipality code
    gdf["CPRO"]  = gdf["CUSEC"].str[:2]   # province code

    # Clean up temp dir
    shutil.rmtree(TMP_DIR)

    return gdf


def make_levels(gdf: gpd.GeoDataFrame, cfg: dict) -> dict:
    """
    From the tract-level GeoDataFrame, dissolve up to municipalities
    and provinces. Returns a dict with keys: tracts, municipalities, provinces.
    """
    sim = cfg["simplification"]
    province_names = cfg["region"]["province_names"]

    # Tracts — simplify geometry only
    tracts = gdf.copy()
    tracts["geometry"] = tracts["geometry"].simplify(
        sim["tracts"], preserve_topology=True
    )

    # Municipalities — dissolve tracts by CUMUN
    municipalities = (
        gdf.dissolve(by="CUMUN", aggfunc="first").reset_index()
    )

    municipalities = municipalities[["CUMUN", "CPRO", "NMUN", "geometry"]]

    municipalities["geometry"] = municipalities["geometry"].simplify(
        sim["municipalities"], preserve_topology=True
    )

    # Provinces — dissolve tracts by CPRO
    provinces = (
        gdf.dissolve(by="CPRO")
        .reset_index()[["CPRO", "geometry"]]
    )
    provinces["province_name"] = provinces["CPRO"].map(province_names)
    provinces["geometry"] = provinces["geometry"].simplify(
        sim["provinces"], preserve_topology=True
    )

    print(f"  [levels] {len(tracts):,} tracts · "
          f"{len(municipalities):,} municipalities · "
          f"{len(provinces):,} provinces")

    return {
        "tracts": tracts,
        "municipalities": municipalities,
        "provinces": provinces
    }