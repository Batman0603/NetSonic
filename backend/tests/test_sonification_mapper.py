from app.sonification.mapper import (
    SonificationMapper,
)


def test_inbound_maps_to_left():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1,
        download_mbps=10,
        packets_per_second=100,
        protocol="TCP",
        direction="inbound",
    )

    assert result.stereo_pan == -0.8


def test_outbound_maps_to_right():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=10,
        download_mbps=1,
        packets_per_second=100,
        protocol="TCP",
        direction="outbound",
    )

    assert result.stereo_pan == 0.8


def test_local_maps_to_center():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1,
        download_mbps=1,
        packets_per_second=10,
        protocol="TCP",
        direction="local",
    )

    assert result.stereo_pan == 0.0


def test_tcp_uses_sine():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1,
        download_mbps=1,
        packets_per_second=10,
        protocol="TCP",
        direction="inbound",
    )

    assert result.waveform == "sine"


def test_udp_uses_triangle():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1,
        download_mbps=1,
        packets_per_second=10,
        protocol="UDP",
        direction="inbound",
    )

    assert result.waveform == "triangle"


def test_icmp_uses_square():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1,
        download_mbps=1,
        packets_per_second=10,
        protocol="ICMP",
        direction="inbound",
    )

    assert result.waveform == "square"


def test_frequency_is_bounded():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1000,
        download_mbps=1000,
        packets_per_second=10000,
        protocol="TCP",
        direction="inbound",
    )

    assert (
        220
        <= result.pitch_hz
        <= 880
    )


def test_volume_is_bounded():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1000,
        download_mbps=1000,
        packets_per_second=10000,
        protocol="TCP",
        direction="inbound",
    )

    assert (
        0.04
        <= result.volume
        <= 0.80
    )


def test_pulse_rate_is_bounded():
    mapper = SonificationMapper()

    result = mapper.map_traffic(
        upload_mbps=1000,
        download_mbps=1000,
        packets_per_second=10000,
        protocol="TCP",
        direction="inbound",
    )

    assert (
        0.5
        <= result.pulse_rate_hz
        <= 8.0
    )