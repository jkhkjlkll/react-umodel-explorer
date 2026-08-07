package com.alibaba.umodel.sdk.model;

public final class UModelSdkException extends RuntimeException {
    public enum Category {
        PARSE_ERROR,
        VALIDATION_ERROR,
        UNKNOWN_TYPE,
        UNSUPPORTED_VERSION,
        MISSING_FIELD
    }

    private final Category category;
    private final String path;

    public UModelSdkException(Category category, String path, String message) {
        super(message);
        this.category = category;
        this.path = path;
    }

    public UModelSdkException(Category category, String path, String message, Throwable cause) {
        super(message, cause);
        this.category = category;
        this.path = path;
    }

    public Category category() {
        return category;
    }

    public String path() {
        return path;
    }
}
