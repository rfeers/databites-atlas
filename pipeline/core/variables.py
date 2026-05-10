import io
import pandas as pd
from .download import download


def parse_ine_atlas_renta(raw: bytes, province_codes: list) -> pd.DataFrame:
    """
    Parse INE Atlas de Renta CSV (table 30824 or similar).

    Returns a DataFrame with columns: CUSEC | indicator | year | value
    Filtered to the region's province codes.
    """
    df = pd.read_csv(
        io.BytesIO(raw),
        sep=";",
        encoding="utf-8-sig",
        dtype=str
    )

    df.columns = ["municipio", "distrito", "seccion", "indicator", "year", "value"]

    # Extract 10-digit CUSEC from Secciones column
    df["CUSEC"] = df["seccion"].str.extract(r"^(\d{10})")
    df = df[df["CUSEC"].notna()].copy()

    # Filter to region
    df = df[df["CUSEC"].str[:2].isin(province_codes)].copy()

    # Parse year
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

    # Handle INE null values (suppressed data shown as ".")
    df["value"] = df["value"].replace(".", None)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")

    df = df[["CUSEC", "indicator", "year", "value"]].reset_index(drop=True)
    print(f"    [parsed] {len(df):,} rows for region tracts")
    return df


# ── Dispatcher — add new source types here as elif blocks ─────────────────

PARSERS = {
    "ine_atlas_renta": parse_ine_atlas_renta,
}


def build_data(gdf_levels: dict, cfg: dict, force: bool = False) -> dict:
    """
    Download each source once, extract all its variables, aggregate up.

    Returns:
      {
        "tracts":         { CUSEC:  { var_id: { year: value } } },
        "municipalities": { CUMUN:  { var_id: { year: value } } },
        "provinces":      { CPRO:   { var_id: { year: value } } },
      }
    """
    province_codes = cfg["region"]["province_codes"]
    sources        = cfg["sources"]

    # ── Step 1: download and parse each source once ────────────────────────
    parsed = {}
    for source_id, source_cfg in sources.items():
        print(f"\n  [source] {source_cfg['label']}")
        raw    = download(source_cfg["url"], source_id, force)
        parser = PARSERS.get(source_cfg["type"])
        if not parser:
            raise ValueError(f"Unknown source type: {source_cfg['type']}")
        parsed[source_id] = parser(raw, province_codes)

    # ── Step 2: extract each variable from its source ──────────────────────
    tract_data = {}  # { CUSEC: { var_id: { year: value } } }

    for source_id, source_cfg in sources.items():
        df = parsed[source_id]

        for var in source_cfg["variables"]:
            var_id    = var["id"]
            indicator = var["indicator"]
            decimals  = var.get("decimals", 2)

            subset = df[df["indicator"] == indicator][["CUSEC", "year", "value"]]
            print(f"    [var] {var_id}: {len(subset):,} rows")

            for _, row in subset.iterrows():
                cusec = row["CUSEC"]
                year  = int(row["year"]) if pd.notna(row["year"]) else None
                raw_value = float(row["value"]) * 1000  # INE publishes in €thousands
                value = round(raw_value, decimals) if pd.notna(row["value"]) else None

                if year and value is not None:
                    tract_data.setdefault(cusec, {}).setdefault(var_id, {})[year] = value

    # ── Step 3: aggregate to municipality and province level ───────────────
    tracts_gdf     = gdf_levels["tracts"][["CUSEC", "CUMUN", "CPRO"]]
    cusec_to_cumun = dict(zip(tracts_gdf["CUSEC"], tracts_gdf["CUMUN"]))
    cusec_to_cpro  = dict(zip(tracts_gdf["CUSEC"], tracts_gdf["CPRO"]))

    mun_raw  = {}  # { CUMUN: { var_id: { year: [values] } } }
    prov_raw = {}  # { CPRO:  { var_id: { year: [values] } } }

    for cusec, vars_dict in tract_data.items():
        cumun = cusec_to_cumun.get(cusec)
        cpro  = cusec_to_cpro.get(cusec)
        for var_id, years_dict in vars_dict.items():
            for year, value in years_dict.items():
                if cumun:
                    mun_raw.setdefault(cumun, {}).setdefault(var_id, {}).setdefault(year, []).append(value)
                if cpro:
                    prov_raw.setdefault(cpro, {}).setdefault(var_id, {}).setdefault(year, []).append(value)

    def _avg(vals):
        return round(sum(vals) / len(vals), 2) if vals else None

    mun_data  = {
        cumun: {
            var_id: {yr: _avg(vals) for yr, vals in yrs.items()}
            for var_id, yrs in vd.items()
        }
        for cumun, vd in mun_raw.items()
    }

    prov_data = {
        cpro: {
            var_id: {yr: _avg(vals) for yr, vals in yrs.items()}
            for var_id, yrs in vd.items()
        }
        for cpro, vd in prov_raw.items()
    }

    print(f"\n  [aggregated] {len(tract_data):,} tracts · "
          f"{len(mun_data):,} municipalities · "
          f"{len(prov_data):,} provinces")

    return {
        "tracts":         tract_data,
        "municipalities": mun_data,
        "provinces":      prov_data,
    }