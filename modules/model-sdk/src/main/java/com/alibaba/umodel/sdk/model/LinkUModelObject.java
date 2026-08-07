package com.alibaba.umodel.sdk.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.util.ArrayList;
import java.util.List;

public abstract class LinkUModelObject extends BaseUModelObject {
    protected LinkUModelObject(String expectedKind) {
        super(expectedKind);
    }

    @JsonIgnore
    public LinkEndpoint source() {
        return LinkEndpoint.from(getSpec().get("src"));
    }

    @JsonIgnore
    public LinkEndpoint destination() {
        return LinkEndpoint.from(getSpec().get("dest"));
    }

    public void setSource(LinkEndpoint endpoint) {
        getSpec().put("src", endpoint == null ? null : endpoint.toMap());
    }

    public void setDestination(LinkEndpoint endpoint) {
        getSpec().put("dest", endpoint == null ? null : endpoint.toMap());
    }

    @Override
    public List<ValidationError> validate() {
        List<ValidationError> errors = new ArrayList<>(super.validate());
        validateEndpoint(errors, "spec.src", source());
        validateEndpoint(errors, "spec.dest", destination());
        return errors;
    }

    private static void validateEndpoint(List<ValidationError> errors, String path, LinkEndpoint endpoint) {
        if (endpoint == null) {
            errors.add(new ValidationError(path, "required link endpoint is missing"));
            return;
        }
        required(errors, path + ".domain", endpoint.domain());
        required(errors, path + ".kind", endpoint.kind());
        required(errors, path + ".name", endpoint.name());
    }
}
