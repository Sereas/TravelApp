"""Live backend performance test and report generation."""

from tests.perf.workspace_perf import (
    backend_available,
    get_perf_backend_url,
    get_perf_source_user_id,
    load_env,
    run_backend_report,
)


def test_backend_trip_workspace_performance():
    load_env()
    backend_url = get_perf_backend_url()
    if not backend_available(backend_url):
        import pytest

        pytest.skip(f"Local backend is not running at {backend_url}")

    report = run_backend_report(
        backend_url=backend_url,
        user_id=get_perf_source_user_id(),
        runs=3,
    )

    for result in report["results"]:
        assert result["http_status"] == 200
        assert result["benchmark_status"] != "fail"
