package com.alibaba.umodel.query.telemetry;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.TelemetryCapabilities;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataRequest;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataResult;
import com.alibaba.umodel.contract.UModelModels.TelemetryHealth;

public class UnavailableTelemetryService implements TelemetryService {
    @Override
    public TelemetryDataResult execute(TelemetryDataRequest request) {
        throw new UModelException(
                ErrorCodes.PROVIDER_UNAVAILABLE,
                "mode=data requires a configured telemetry provider; plan mode is available without external telemetry endpoints"
        );
    }

    @Override
    public TelemetryCapabilities capabilities() {
        return new TelemetryCapabilities("unconfigured", false, false, false, false);
    }

    @Override
    public TelemetryHealth health() {
        return new TelemetryHealth("unconfigured", "unavailable", "no telemetry provider is configured");
    }
}
