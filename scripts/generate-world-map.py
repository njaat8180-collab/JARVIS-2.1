import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "renderer" / "assets" / "world-countries-natural-earth.geojson"
target = ROOT / "renderer" / "assets" / "world-map.svg"
world = json.loads(source.read_text(encoding="utf-8"))

# Robinson projection X and Y coefficients at five-degree latitude steps.
X = [1,.9986,.9954,.9900,.9822,.9730,.9600,.9427,.9216,.8962,.8679,.8350,.7986,.7597,.7186,.6732,.6213,.5722,.5322]
Y = [0,.0620,.1240,.1860,.2480,.3100,.3720,.4340,.4958,.5571,.6176,.6769,.7346,.7903,.8435,.8936,.9394,.9761,1]
W, H, CX, CY = 1600, 900, 800, 450
SX, SY = 278, 360

def interp(values, latitude):
    value = min(90, abs(latitude)) / 5
    low = min(int(value), len(values)-2)
    fraction = value - low
    return values[low] * (1-fraction) + values[low+1] * fraction

def project(lon, lat):
    x = .8487 * math.radians(lon) * interp(X, lat)
    y = 1.3523 * math.copysign(interp(Y, lat), lat)
    return CX + x * SX, CY - y * SY

def ring_path(ring):
    if not ring:
        return ""
    points = [project(float(lon), float(lat)) for lon, lat, *rest in ring]
    chunks = [f"M{points[0][0]:.2f},{points[0][1]:.2f}"]
    chunks.extend(f"L{x:.2f},{y:.2f}" for x, y in points[1:])
    chunks.append("Z")
    return "".join(chunks)

def polygon_paths(polygons):
    return "".join(ring_path(ring) for polygon in polygons for ring in polygon)

paths = []
for feature in world.get("features", []):
    geometry = feature.get("geometry") or {}
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if kind == "Polygon":
        d = polygon_paths([coordinates])
    elif kind == "MultiPolygon":
        d = polygon_paths(coordinates)
    else:
        continue
    name = feature.get("properties", {}).get("NAME_EN") or feature.get("properties", {}).get("ADMIN") or "Country"
    safe_name = (name.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;"))
    if d:
        paths.append(f'<path d="{d}" aria-label="{safe_name}"><title>{safe_name}</title></path>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">
<title id="title">World map with country boundaries</title>
<desc id="desc">Static Robinson-projection world map generated from Natural Earth 1:50m country boundaries.</desc>
<defs><linearGradient id="ocean" x2="0" y2="1"><stop stop-color="#102733"/><stop offset="1" stop-color="#091923"/></linearGradient><radialGradient id="seaGlow"><stop stop-color="#255364" stop-opacity=".55"/><stop offset="1" stop-color="#102733" stop-opacity="0"/></radialGradient></defs>
<rect width="1600" height="900" rx="24" fill="url(#ocean)"/><ellipse cx="800" cy="450" rx="720" ry="365" fill="url(#seaGlow)"/>
<g fill="#b7d3c8" fill-rule="evenodd" stroke="#718e8a" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round">{''.join(paths)}</g>
</svg>'''
target.write_text(svg, encoding="utf-8")
print(f"Wrote {target} ({target.stat().st_size:,} bytes) from {len(paths)} country features")
