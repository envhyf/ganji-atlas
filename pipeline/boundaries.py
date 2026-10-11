"""One canonical county-edge network; shared borders are drawn only once."""
from shapely import make_valid, set_precision
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union


def polygonal(geom):
    repaired = make_valid(shape(geom))
    def parts(g):
        if g.geom_type == 'Polygon':
            return [g]
        return [p for child in getattr(g, 'geoms', []) for p in parts(child)]
    return MultiPolygon(parts(repaired))


def simplify_polygon(geom, tolerance):
    # Preserve topology and small islands; millidegree rounding used to destroy them.
    g = polygonal(geom).simplify(tolerance, preserve_topology=True)
    g = set_precision(g, 0.000001)
    # The browser's national bundle expects one consistent MultiPolygon shape.
    if g.geom_type == 'Polygon':
        g = MultiPolygon([g])
    return mapping(g)


def county_mesh(features, tolerance=0.0005):
    borders = [set_precision(polygonal(f['geometry']), 0.000001).boundary for f in features]
    mesh = unary_union(borders).simplify(tolerance, preserve_topology=True)
    return mapping(mesh)


def province_outline(features, tolerance=0.0005):
    """Province perimeter from the same detailed county geometry as the mesh."""
    area = unary_union([set_precision(polygonal(f["geometry"]), 0.000001) for f in features])
    return simplify_polygon(mapping(area), tolerance)
