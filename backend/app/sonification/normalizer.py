from __future__ import annotations

import math
from collections import deque
from statistics import median


def clamp(
    value: float,
    minimum: float = 0.0,
    maximum: float = 1.0,
) -> float:
    """Constrain a number to an inclusive interval."""
    return max(minimum, min(value, maximum))


class AdaptiveNormalizer:
    """
    Converts network measurements into a stable 0.0-1.0 range.

    A rolling history is maintained so the sonification adapts
    to the current network rather than relying on one fixed
    maximum traffic value.
    """

    def __init__(
        self,
        history_size: int = 100,
        minimum_reference: float = 0.1,
    ) -> None:
        self._history: deque[float] = deque(
            maxlen=history_size
        )
        self._minimum_reference = minimum_reference

    def update(self, value: float) -> float:
        """Add a sample and return its log-scaled rolling percentile ratio."""
        safe_value = max(0.0, float(value))

        self._history.append(safe_value)

        if safe_value <= 0:
            return 0.0

        reference = self._reference_value()

        if reference <= 0:
            return 0.0

        normalized = math.log1p(safe_value) / math.log1p(reference)

        return clamp(normalized)

    def _reference_value(self) -> float:
        if not self._history:
            return self._minimum_reference

        values = sorted(self._history)

        percentile_index = int(
            0.90 * (len(values) - 1)
        )

        percentile_value = values[percentile_index]

        return max(
            self._minimum_reference,
            percentile_value,
        )

    def reset(self) -> None:
        """Discard samples collected for the current capture session."""
        self._history.clear()

    @property
    def sample_count(self) -> int:
        return len(self._history)


def normalize_linear(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    """Scale a value linearly to 0–1, returning zero for invalid ranges."""
    if maximum <= minimum:
        return 0.0

    normalized = (
        (value - minimum)
        / (maximum - minimum)
    )

    return clamp(normalized)
