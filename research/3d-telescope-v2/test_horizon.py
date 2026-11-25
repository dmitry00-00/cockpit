import unittest

import numpy as np

from horizon import horizon, render_view


class HorizonTests(unittest.TestCase):
    def test_north_ridge_is_reported_at_zero_azimuth(self):
        dem = np.zeros((101, 101), dtype=np.float64)
        dem[40, :] = 120.0
        profile = horizon(dem, 50, 70, 10, 400, azimuth_count=360)
        self.assertEqual(profile.azimuth_deg[0], 0)
        self.assertGreater(profile.angle_deg[0], profile.angle_deg[90] + 1)
        self.assertAlmostEqual(profile.distance_m[0], 300, delta=10)

    def test_rays_stop_at_raster_edge_instead_of_repeating_edge_height(self):
        dem = np.zeros((101, 101), dtype=np.float64)
        dem[:, -1] = 500.0
        profile = horizon(dem, 2, 50, 100, 20_000, azimuth_count=360)
        east = 90
        self.assertTrue(profile.clipped_by_raster[east])
        self.assertLessEqual(profile.coverage_m[east], 9_800)
        self.assertGreater(profile.coverage_m[east], 9_700)
        self.assertTrue(np.isfinite(profile.angle_deg[east]))

    def test_reaches_requested_radius_even_when_radius_is_not_a_step_multiple(self):
        profile = horizon(np.zeros((101, 101)), 50, 50, 100, 950, azimuth_count=360, step_m=300)
        self.assertAlmostEqual(profile.coverage_m[0], 950)
        self.assertFalse(profile.clipped_by_raster[0])

    def test_spherical_curvature_lowers_distant_terrain(self):
        dem = np.zeros((301, 301), dtype=np.float64)
        flat = horizon(dem, 150, 150, 100, 10_000, eye_m=100, azimuth_count=360, step_m=10_000,
                       planet_radius_m=1e15)
        curved = horizon(dem, 150, 150, 100, 10_000, eye_m=100, azimuth_count=360, step_m=10_000)
        self.assertLess(curved.angle_deg[0], flat.angle_deg[0] - 0.04)

    def test_spherical_angle_uses_tangent_projection_and_stops_at_forward_hemisphere(self):
        radius = 1000.0
        distance = np.pi * radius / 3
        dem = np.zeros((3, 3), dtype=np.float64)
        profile = horizon(dem, 1, 1, distance, distance * 2, eye_m=0,
                          planet_radius_m=radius, azimuth_count=360, step_m=distance)
        self.assertAlmostEqual(profile.angle_deg[0], -30.0, places=7)
        self.assertTrue(profile.geometry_limited)
        self.assertAlmostEqual(profile.coverage_m[0], distance, places=7)

    def test_eye_height_changes_the_geometric_horizon(self):
        dem = np.zeros((601, 601), dtype=np.float64)
        low = horizon(dem, 300, 300, 100, 20_000, eye_m=1.7, azimuth_count=360)
        high = horizon(dem, 300, 300, 100, 20_000, eye_m=10, azimuth_count=360)
        self.assertLess(high.angle_deg[0], low.angle_deg[0])
        self.assertGreater(high.distance_m[0], low.distance_m[0])

    def test_view_uses_explicit_horizontal_and_vertical_fov(self):
        dem = np.zeros((101, 101), dtype=np.float64)
        dem[40, :] = 120
        frame = render_view(dem, 50, 70, 10, 400, azimuth_deg=0,
                            horizontal_fov_deg=60, vertical_fov_deg=20,
                            width=3, height=5, step_m=10)
        self.assertEqual(frame.rgb.shape, (5, 3, 3))
        np.testing.assert_allclose(frame.azimuth_deg, [-20, 0, 20])
        self.assertGreater(frame.horizon_angle_deg[1], frame.horizon_angle_deg[0])
        flat = np.zeros((101, 101), dtype=np.float64)
        frame = render_view(flat, 50, 50, 10, 400, azimuth_deg=0,
                            horizontal_fov_deg=60, vertical_fov_deg=20,
                            width=3, height=5, step_m=10)
        pitched = render_view(flat, 50, 50, 10, 400, azimuth_deg=0,
                              horizontal_fov_deg=60, vertical_fov_deg=10,
                              pitch_deg=10, width=3, height=5, step_m=10)
        self.assertFalse(np.array_equal(frame.rgb, pitched.rgb))

    def test_rejects_observer_outside_raster(self):
        with self.assertRaisesRegex(ValueError, "observer lies outside"):
            horizon(np.zeros((5, 5)), 5, 2, 1, 2)


if __name__ == "__main__":
    unittest.main()
