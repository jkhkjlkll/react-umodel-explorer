package com.alibaba.umodel.contract;

import java.util.Map;

public class UModelException extends RuntimeException {
    private final String code;
    private final Map<String, String> details;

    public UModelException(String code, String message) {
        this(code, message, Map.of());
    }

    public UModelException(String code, String message, Map<String, String> details) {
        super(message);
        this.code = code;
        this.details = details == null ? Map.of() : Map.copyOf(details);
    }

    public String code() {
        return code;
    }

    public Map<String, String> details() {
        return details;
    }
}

