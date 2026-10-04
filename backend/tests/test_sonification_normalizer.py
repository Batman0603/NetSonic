from app.sonification.normalizer import (
    AdaptiveNormalizer,
    clamp,
    normalize_linear,
)


def test_clamp():
    assert clamp(-1.0) == 0.0
    assert clamp(0.5) == 0.5
    assert clamp(2.0) == 1.0


def test_linear_normalization():
    assert normalize_linear(
        0,
        0,
        100,
    ) == 0.0

    assert normalize_linear(
        50,
        0,
        100,
    ) == 0.5

    assert normalize_linear(
        100,
        0,
        100,
    ) == 1.0


def test_adaptive_normalizer_returns_bounded_values():
    normalizer = AdaptiveNormalizer()

    values = [
        normalizer.update(value)
        for value in (
            0,
            1,
            5,
            10,
            50,
            100,
        )
    ]

    assert all(
        0.0 <= value <= 1.0
        for value in values
    )