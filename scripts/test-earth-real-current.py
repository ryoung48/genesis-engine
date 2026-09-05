import importlib.util
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("current_builder", Path(__file__).with_name("build-earth-real-current.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def test_latitude_orientation():
    latitude = np.array([-60.0, -30.0, 0.0, 30.0, 60.0])
    longitude = np.array([0.0, 90.0, 180.0, 270.0])
    data = np.broadcast_to(latitude[None, :, None], (12, 5, 4))
    result = builder.resample_coordinates({"data": data, "lat": latitude, "lon": longitude, "width": 4, "height": 6})
    np.testing.assert_allclose(result[0, 1:5, 0], [45, 15, -15, -45])
    assert np.isnan(result[:, [0, 5], :]).all()
    reversed_result = builder.resample_coordinates({"data": data[:, ::-1], "lat": latitude[::-1], "lon": longitude, "width": 4, "height": 6})
    np.testing.assert_allclose(result, reversed_result)


def test_longitude_centers_and_missing_values():
    latitude = np.array([-45.0, 45.0])
    longitude = np.array([45.0, 135.0, 225.0, 315.0])
    data = np.broadcast_to(np.array([1.0, 2.0, 3.0, 4.0])[None, None, :], (12, 2, 4)).copy()
    result = builder.resample_coordinates({"data": data, "lat": latitude, "lon": longitude, "width": 4, "height": 2})
    np.testing.assert_allclose(result[0, 0], [3, 4, 1, 2])
    data[:, :, 2] = np.nan
    result = builder.resample_coordinates({"data": data, "lat": latitude, "lon": longitude, "width": 4, "height": 2})
    assert np.isnan(result[:, :, 0]).all()
    np.testing.assert_allclose(result[0, 0, 1:], [4, 1, 2])


if __name__ == "__main__":
    test_latitude_orientation()
    test_longitude_centers_and_missing_values()
    print("Ocean raster coordinate tests passed")
