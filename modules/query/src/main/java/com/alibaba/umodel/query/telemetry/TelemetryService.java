package com.alibaba.umodel.query.telemetry;

import com.alibaba.umodel.contract.UModelModels.TelemetryCapabilities;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataRequest;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataResult;
import com.alibaba.umodel.contract.UModelModels.TelemetryHealth;

public interface TelemetryService {
    TelemetryDataResult execute(TelemetryDataRequest request);

    TelemetryCapabilities capabilities();

    TelemetryHealth health();
}
