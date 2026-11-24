"""Synthetic-safe horizon sampling for a georeferenced elevation raster.

Azimuth convention matches the original experiment: 0° is north, clockwise.
Raster coordinates are pixel centers; +x east, +y south. No sample outside the
available raster is extrapolated. Terrain height is measured from the observer's
local tangent plane and corrected for spherical planetary curvature.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class HorizonProfile:
    azimuth_deg: np.ndarray
    angle_deg: np.ndarray
    distance_m: np.ndarray
    coverage_m: np.ndarray
    clipped_by_raster: np.ndarray
    geometry_limited: bool


@dataclass(frozen=True)
class ViewFrame:
    rgb: np.ndarray
    azimuth_deg: np.ndarray
    horizon_angle_deg: np.ndarray
    horizon_distance_m: np.ndarray
    coverage_m: np.ndarray
    clipped_by_raster: np.ndarray
    geometry_limited: bool


def _sample_bilinear(height_m: np.ndarray, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Bilinear samples and validity mask; invalid coordinates are never clamped."""
    h, w = height_m.shape
    valid = (x >= 0) & (y >= 0) & (x <= w - 1) & (y <= h - 1)
    xc = np.clip(x, 0, w - 1)
    yc = np.clip(y, 0, h - 1)
    x0 = np.floor(xc).astype(np.intp)
    y0 = np.floor(yc).astype(np.intp)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    dx = xc - x0
    dy = yc - y0
    value = (
        height_m[y0, x0] * (1 - dx) * (1 - dy)
        + height_m[y0, x1] * dx * (1 - dy)
        + height_m[y1, x0] * (1 - dx) * dy
        + height_m[y1, x1] * dx * dy
    )
    return value, valid


def horizon(
    height_m: np.ndarray,
    x: float,
    y: float,
    meters_per_pixel: float,
    radius_m: float,
    eye_m: float = 1.7,
    *,
    planet_radius_m: float = 6_371_000.0,
    azimuth_count: int = 720,
    step_m: float | None = None,
    azimuths_deg: np.ndarray | None = None,
) -> HorizonProfile:
    """Return the maximum apparent elevation and its distance for each azimuth.

    Rays stop at the requested radius or the first point outside the raster.
    The observer and target DEM heights share a local tangent plane. For arc
    distance ``d``, spherical sagitta ``2R sin²(d/(2R))`` lowers the target.
    """
    dem = np.asarray(height_m, dtype=np.float64)
    if dem.ndim != 2 or min(dem.shape, default=0) < 2:
        raise ValueError("height_m must be a 2D raster at least 2x2")
    if not np.isfinite(dem).all():
        raise ValueError("height_m must contain only finite elevation values")
    if not np.isfinite([x, y, meters_per_pixel, radius_m, eye_m, planet_radius_m]).all():
        raise ValueError("observer and scale parameters must be finite")
    if meters_per_pixel <= 0 or radius_m <= 0 or planet_radius_m <= 0 or eye_m < 0:
        raise ValueError("scales must be positive and eye_m non-negative")
    if azimuths_deg is None and (not isinstance(azimuth_count, int) or azimuth_count < 1):
        raise ValueError("azimuth_count must be a positive integer")
    if x < 0 or y < 0 or x > dem.shape[1] - 1 or y > dem.shape[0] - 1:
        raise ValueError("observer lies outside the elevation raster")

    spacing = step_m if step_m is not None else meters_per_pixel
    if not np.isfinite(spacing) or spacing <= 0:
        raise ValueError("step_m must be finite and positive")
    # A farther surface point is in the rear hemisphere and has no forward
    # tangent-plane ray from the observer. Do not fold it back into the view.
    hemisphere_distance = np.pi * planet_radius_m / 2
    geometry_limited = radius_m > hemisphere_distance
    max_distance = min(radius_m, hemisphere_distance)
    distances = np.arange(spacing, max_distance, spacing, dtype=np.float64)
    distances = np.concatenate((distances, np.array([max_distance], dtype=np.float64)))

    azimuth_deg = (np.arange(azimuth_count, dtype=np.float64) * (360.0 / azimuth_count)
                   if azimuths_deg is None else np.asarray(azimuths_deg, dtype=np.float64))
    if azimuth_deg.ndim != 1 or azimuth_deg.size == 0 or not np.isfinite(azimuth_deg).all():
        raise ValueError("azimuths_deg must be a non-empty 1D array of finite values")
    azimuth = np.deg2rad(azimuth_deg)[:, None]
    ray_m = distances[None, :]
    pixel_distance = ray_m / meters_per_pixel
    xs = x + pixel_distance * np.sin(azimuth)
    ys = y - pixel_distance * np.cos(azimuth)
    sampled, valid = _sample_bilinear(dem, xs, ys)

    # Stable exact sagitta for surface arc distance d: R * (1 - cos(d/R)).
    curvature_drop = 2 * planet_radius_m * np.sin(ray_m / (2 * planet_radius_m)) ** 2
    observer_height = float(_sample_bilinear(dem, np.array(x), np.array(y))[0]) + eye_m
    horizontal_distance = planet_radius_m * np.sin(ray_m / planet_radius_m)
    angle = np.arctan2(sampled - observer_height - curvature_drop, horizontal_distance)
    angle = np.where(valid, angle, -np.inf)

    valid_count = valid.sum(axis=1)
    best_index = np.argmax(angle, axis=1)
    rows = np.arange(azimuth_deg.size)
    best_angle = np.degrees(angle[rows, best_index])
    best_distance = distances[best_index]
    coverage = np.where(valid_count > 0, distances[np.maximum(valid_count - 1, 0)], 0.0)
    clipped = (~valid).any(axis=1)
    best_angle = np.where(valid_count > 0, best_angle, np.nan)
    best_distance = np.where(valid_count > 0, best_distance, np.nan)
    return HorizonProfile(azimuth_deg, best_angle, best_distance, coverage, clipped, geometry_limited)


def render_view(
    height_m: np.ndarray,
    x: float,
    y: float,
    meters_per_pixel: float,
    radius_m: float,
    *,
    azimuth_deg: float,
    horizontal_fov_deg: float,
    vertical_fov_deg: float,
    pitch_deg: float = 0.0,
    width: int = 800,
    height: int = 600,
    eye_m: float = 1.7,
    planet_radius_m: float = 6_371_000.0,
    step_m: float | None = None,
) -> ViewFrame:
    """Render a simple terrain/sky silhouette using independently specified H/V FOV.

    This is a geometric prototype, not a lens, sensor, refraction, or Cardboard
    distortion model. Pixel rays are centered in each column/row.
    """
    if not isinstance(width, int) or width < 1 or not isinstance(height, int) or height < 1:
        raise ValueError("view width and height must be positive integers")
    if not np.isfinite([azimuth_deg, horizontal_fov_deg, vertical_fov_deg, pitch_deg]).all():
        raise ValueError("view angles must be finite")
    if not 0 < horizontal_fov_deg <= 360 or not 0 < vertical_fov_deg < 180:
        raise ValueError("horizontal FOV must be in (0, 360] and vertical FOV in (0, 180)")
    if not -90 <= pitch_deg <= 90:
        raise ValueError("pitch_deg must be between -90 and 90")

    columns = np.arange(width, dtype=np.float64)
    azimuths = azimuth_deg + ((columns + 0.5) / width - 0.5) * horizontal_fov_deg
    profile = horizon(
        height_m, x, y, meters_per_pixel, radius_m, eye_m,
        planet_radius_m=planet_radius_m, step_m=step_m, azimuths_deg=azimuths,
    )
    rows = np.arange(height, dtype=np.float64)
    elevation = pitch_deg + (0.5 - (rows + 0.5) / height) * vertical_fov_deg
    terrain = elevation[:, None] <= profile.angle_deg[None, :]

    sky_top = np.array([95.0, 140.0, 210.0])
    sky_horizon = np.array([200.0, 220.0, 235.0])
    ground = np.array([115.0, 125.0, 100.0])
    sky_t = np.clip((elevation - (pitch_deg - vertical_fov_deg / 2)) / vertical_fov_deg, 0, 1)
    sky = sky_horizon[None, :] * (1 - sky_t[:, None, None]) + sky_top[None, :] * sky_t[:, None, None]
    rgb = np.broadcast_to(sky, (height, width, 3)).copy()
    rgb[terrain] = np.broadcast_to(ground, (height, width, 3))[terrain]
    return ViewFrame(rgb.astype(np.uint8), profile.azimuth_deg, profile.angle_deg,
                     profile.distance_m, profile.coverage_m, profile.clipped_by_raster,
                     profile.geometry_limited)
