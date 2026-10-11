import sys
import unittest
from pathlib import Path

from shapely.geometry import Polygon, shape

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from export_province import simplify


class BoundaryTests(unittest.TestCase):
    def test_export_keeps_multipolygon_shape_for_single_polygon(self):
        square = Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])
        self.assertEqual(simplify(square.__geo_interface__, .001)['type'], 'MultiPolygon')

    def test_self_crossing_source_ring_is_repaired(self):
        bow = {'type': 'Polygon', 'coordinates': [[[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]]}
        repaired = shape(simplify(bow, 0))
        self.assertTrue(repaired.is_valid)
        self.assertAlmostEqual(repaired.area, 2)

    def test_county_mesh_draws_shared_edges_once(self):
        from boundaries import county_mesh
        features = [
            {'geometry': Polygon([(0, 0), (1, 0), (1, .5), (1, 1), (0, 1)]).__geo_interface__},
            {'geometry': Polygon([(1, 0), (2, 0), (2, 1), (1, 1), (1, .5)]).__geo_interface__},
        ]
        mesh = shape(county_mesh(features, tolerance=0))
        # Two square perimeters total 8; a single shared edge removes length 1.
        self.assertAlmostEqual(mesh.length, 7)
        self.assertTrue(mesh.is_simple)

    def test_province_outline_excludes_shared_county_edge(self):
        from boundaries import province_outline
        features = [
            {'geometry': Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]).__geo_interface__},
            {'geometry': Polygon([(1, 0), (2, 0), (2, 1), (1, 1)]).__geo_interface__},
        ]
        outline = shape(province_outline(features, tolerance=0))
        self.assertAlmostEqual(outline.boundary.length, 6)
        self.assertAlmostEqual(outline.area, 2)
        self.assertTrue(outline.is_valid)

    def test_small_coastal_island_survives_simplification(self):
        small = Polygon([(108, 22), (108.0004, 22), (108.0004, 22.0004), (108, 22.0004)])
        result = shape(simplify(small.__geo_interface__, .008))
        self.assertFalse(result.is_empty)
        self.assertTrue(result.is_valid)


if __name__ == '__main__':
    unittest.main()
