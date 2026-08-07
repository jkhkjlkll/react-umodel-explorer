package com.alibaba.umodel.sdk.client;

import java.net.URI;

public final class UModelClientException extends RuntimeException {
    private final int statusCode;
    private final String method;
    private final URI uri;
    private final String errorCode;
    private final boolean retryable;
    private final String responseBody;

    public UModelClientException(
            String message,
            int statusCode,
            String method,
            URI uri,
            String errorCode,
            boolean retryable,
            String responseBody
    ) {
        super(message);
        this.statusCode = statusCode;
        this.method = method;
        this.uri = uri;
        this.errorCode = errorCode;
        this.retryable = retryable;
        this.responseBody = responseBody;
    }

    public UModelClientException(String message, String method, URI uri, Throwable cause) {
        super(message, cause);
        this.statusCode = 0;
        this.method = method;
        this.uri = uri;
        this.errorCode = "TransportError";
        this.retryable = true;
        this.responseBody = "";
    }

    public int statusCode() {
        return statusCode;
    }

    public String method() {
        return method;
    }

    public URI uri() {
        return uri;
    }

    public String errorCode() {
        return errorCode;
    }

    public boolean retryable() {
        return retryable;
    }

    public String responseBody() {
        return responseBody;
    }
}
