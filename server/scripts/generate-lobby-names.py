#!/usr/bin/env python3
"""
Generate server/lobbyNames.js from admin1_clean.gpkg.

Output is a curated list of short, memorable place names used as random lobby
identifiers. Each entry carries the metadata the Lobby tooltip needs:
  - countries: { isRegion: false, continent }
  - regions:   { isRegion: true,  country, isoCode }

Run once after updating the GeoPackage:
  python server/scripts/generate-lobby-names.py

Override paths via env vars:
  DATA_GPKG  (defaults to ../../geoclip/data/admin1_clean.gpkg)
  OUT        (defaults to ../lobbyNames.js)
  MAX_LEN    (defaults to 8 — names longer than this are skipped)
  MIN_LEN    (defaults to 3)
"""
import os
import sys
import unicodedata

import geopandas as gpd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_GPKG = os.environ.get(
    "DATA_GPKG",
    os.path.normpath(os.path.join(HERE, "..", "..", "geoclip", "data", "admin1_clean.gpkg")),
)
OUT = os.environ.get("OUT", os.path.normpath(os.path.join(HERE, "..", "lobbyNames.js")))
MAX_LEN = int(os.environ.get("MAX_LEN", "8"))
MIN_LEN = int(os.environ.get("MIN_LEN", "3"))

# ISO 3166-1 alpha-2 → continent. SpotTheShot-specific (used only for the
# lobby-name tooltip), so it lives here rather than in FastGeoCLIP.
ISO_TO_CONTINENT = {
    # Europe
    'AD':'Europe','AL':'Europe','AT':'Europe','AX':'Europe','BA':'Europe','BE':'Europe',
    'BG':'Europe','BY':'Europe','CH':'Europe','CZ':'Europe','DE':'Europe','DK':'Europe',
    'EE':'Europe','ES':'Europe','FI':'Europe','FO':'Europe','FR':'Europe','GB':'Europe',
    'GG':'Europe','GI':'Europe','GR':'Europe','HR':'Europe','HU':'Europe','IE':'Europe',
    'IM':'Europe','IS':'Europe','IT':'Europe','JE':'Europe','LI':'Europe','LT':'Europe',
    'LU':'Europe','LV':'Europe','MC':'Europe','MD':'Europe','ME':'Europe','MK':'Europe',
    'MT':'Europe','NL':'Europe','NO':'Europe','PL':'Europe','PT':'Europe','RO':'Europe',
    'RS':'Europe','RU':'Europe','SE':'Europe','SI':'Europe','SJ':'Europe','SK':'Europe',
    'SM':'Europe','UA':'Europe','VA':'Europe','XK':'Europe',
    # Asia
    'AE':'Asia','AF':'Asia','AM':'Asia','AZ':'Asia','BD':'Asia','BH':'Asia','BN':'Asia',
    'BT':'Asia','CC':'Asia','CN':'Asia','CX':'Asia','CY':'Asia','GE':'Asia','HK':'Asia',
    'ID':'Asia','IL':'Asia','IN':'Asia','IO':'Asia','IQ':'Asia','IR':'Asia','JO':'Asia',
    'JP':'Asia','KG':'Asia','KH':'Asia','KP':'Asia','KR':'Asia','KW':'Asia','KZ':'Asia',
    'LA':'Asia','LB':'Asia','LK':'Asia','MM':'Asia','MN':'Asia','MO':'Asia','MV':'Asia',
    'MY':'Asia','NP':'Asia','OM':'Asia','PH':'Asia','PK':'Asia','PS':'Asia','QA':'Asia',
    'SA':'Asia','SG':'Asia','SY':'Asia','TH':'Asia','TJ':'Asia','TL':'Asia','TM':'Asia',
    'TR':'Asia','TW':'Asia','UZ':'Asia','VN':'Asia','YE':'Asia',
    # Africa
    'AO':'Africa','BF':'Africa','BI':'Africa','BJ':'Africa','BW':'Africa','CD':'Africa',
    'CF':'Africa','CG':'Africa','CI':'Africa','CM':'Africa','CV':'Africa','DJ':'Africa',
    'DZ':'Africa','EG':'Africa','EH':'Africa','ER':'Africa','ET':'Africa','GA':'Africa',
    'GH':'Africa','GM':'Africa','GN':'Africa','GQ':'Africa','GW':'Africa','KE':'Africa',
    'KM':'Africa','LR':'Africa','LS':'Africa','LY':'Africa','MA':'Africa','MG':'Africa',
    'ML':'Africa','MR':'Africa','MU':'Africa','MW':'Africa','MZ':'Africa','NA':'Africa',
    'NE':'Africa','NG':'Africa','RE':'Africa','RW':'Africa','SC':'Africa','SD':'Africa',
    'SH':'Africa','SL':'Africa','SN':'Africa','SO':'Africa','SS':'Africa','ST':'Africa',
    'SZ':'Africa','TD':'Africa','TG':'Africa','TN':'Africa','TZ':'Africa','UG':'Africa',
    'YT':'Africa','ZA':'Africa','ZM':'Africa','ZW':'Africa',
    # North America
    'AG':'North America','AI':'North America','AW':'North America','BB':'North America',
    'BL':'North America','BM':'North America','BQ':'North America','BS':'North America',
    'BZ':'North America','CA':'North America','CR':'North America','CU':'North America',
    'CW':'North America','DM':'North America','DO':'North America','GD':'North America',
    'GL':'North America','GP':'North America','GT':'North America','HN':'North America',
    'HT':'North America','JM':'North America','KN':'North America','KY':'North America',
    'LC':'North America','MF':'North America','MQ':'North America','MS':'North America',
    'MX':'North America','NI':'North America','PA':'North America','PM':'North America',
    'PR':'North America','SV':'North America','SX':'North America','TC':'North America',
    'TT':'North America','US':'North America','VC':'North America','VG':'North America',
    'VI':'North America',
    # South America
    'AR':'South America','BO':'South America','BR':'South America','CL':'South America',
    'CO':'South America','EC':'South America','FK':'South America','GF':'South America',
    'GY':'South America','PE':'South America','PY':'South America','SR':'South America',
    'UY':'South America','VE':'South America',
    # Oceania
    'AS':'Oceania','AU':'Oceania','CK':'Oceania','FJ':'Oceania','FM':'Oceania','GU':'Oceania',
    'KI':'Oceania','MH':'Oceania','MP':'Oceania','NC':'Oceania','NF':'Oceania','NR':'Oceania',
    'NU':'Oceania','NZ':'Oceania','PF':'Oceania','PG':'Oceania','PN':'Oceania','PW':'Oceania',
    'SB':'Oceania','TK':'Oceania','TO':'Oceania','TV':'Oceania','UM':'Oceania','VU':'Oceania',
    'WF':'Oceania','WS':'Oceania',
    # Antarctica
    'AQ':'Antarctica','BV':'Antarctica','GS':'Antarctica','HM':'Antarctica','TF':'Antarctica',
}


def to_ascii_upper(s):
    nfd = unicodedata.normalize('NFD', str(s))
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn').upper().strip()


def js_str(s):
    """Single-quoted JS string literal with escape for stray single quotes."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def length_ok(name):
    return MIN_LEN <= len(name) <= MAX_LEN and name.isascii() and " " not in name


def main():
    if not os.path.isfile(DATA_GPKG):
        sys.exit(f"GeoPackage not found at {DATA_GPKG}. Set DATA_GPKG to override.")

    df = gpd.read_file(DATA_GPKG, layer="regions")

    # Collect countries first (so we can avoid region/country name clashes).
    countries = {}
    for _, row in df.drop_duplicates(subset=["admin"]).iterrows():
        country = str(row["admin"]).strip()
        iso = str(row["iso_a2"]).strip()
        name = to_ascii_upper(country)
        if not length_ok(name):
            continue
        continent = ISO_TO_CONTINENT.get(iso)
        if not continent:
            continue
        countries.setdefault(name, {"isRegion": False, "continent": continent, "country": country})

    # Then regions (skip names that collide with countries to keep tooltips unambiguous).
    regions = {}
    for _, row in df.iterrows():
        name_en = str(row.get("name_en", "")).strip()
        country = str(row["admin"]).strip()
        iso = str(row["iso_a2"]).strip()
        name = to_ascii_upper(name_en)
        if not length_ok(name) or name in countries:
            continue
        regions.setdefault(name, {
            "isRegion": True,
            "country": to_ascii_upper(country),
            "isoCode": iso,
        })

    # Emit
    lines = [
        "// AUTO-GENERATED — regenerate with: python server/scripts/generate-lobby-names.py",
        "// Source: geoclip/data/admin1_clean.gpkg (Natural Earth admin-1 boundaries).",
        "//",
        "// Each entry produces a lobby ID and an optional tooltip metadata payload:",
        "//   - Countries: { isRegion: false, continent }",
        "//   - Regions:   { isRegion: true,  country, isoCode }",
        "",
        "export const LOBBY_NAMES = [",
        "  // Countries (with continent)",
    ]
    for name in sorted(countries):
        meta = countries[name]
        lines.append(
            f"  {{ name: {js_str(name)}, metadata: {{ isRegion: false, continent: {js_str(meta['continent'])} }} }},"
        )
    lines.append("")
    lines.append("  // Regions (with country)")
    for name in sorted(regions):
        meta = regions[name]
        lines.append(
            f"  {{ name: {js_str(name)}, metadata: {{ isRegion: true, country: {js_str(meta['country'])}, isoCode: {js_str(meta['isoCode'])} }} }},"
        )
    lines.append("];")

    with open(OUT, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Wrote {len(countries)} countries + {len(regions)} regions to {OUT}")


if __name__ == "__main__":
    main()
