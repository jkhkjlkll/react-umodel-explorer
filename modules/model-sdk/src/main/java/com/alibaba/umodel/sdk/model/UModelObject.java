package com.alibaba.umodel.sdk.model;

import java.util.List;
import java.util.Map;

public interface UModelObject {
    String getKind();

    Map<String, Object> getSchema();

    Map<String, Object> getMetadata();

    Map<String, Object> getSpec();

    List<ValidationError> validate();

    default String schemaVersion() {
        Object version = getSchema() == null ? null : getSchema().get("version");
        return version == null ? "" : String.valueOf(version);
    }

    default String domain() {
        Object domain = getMetadata() == null ? null : getMetadata().get("domain");
        return domain == null ? "" : String.valueOf(domain);
    }

    default String name() {
        Object name = getMetadata() == null ? null : getMetadata().get("name");
        return name == null ? "" : String.valueOf(name);
    }
}
