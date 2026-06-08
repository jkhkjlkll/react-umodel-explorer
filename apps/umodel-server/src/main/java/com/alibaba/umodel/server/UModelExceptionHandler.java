package com.alibaba.umodel.server;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.ErrorBody;
import com.alibaba.umodel.contract.UModelModels.ErrorEnvelope;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class UModelExceptionHandler {
    @ExceptionHandler(UModelException.class)
    public ResponseEntity<ErrorEnvelope> handleUModel(UModelException error) {
        return ResponseEntity
                .status(status(error.code()))
                .body(new ErrorEnvelope(new ErrorBody(error.code(), error.getMessage(), false)));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorEnvelope> handleGeneric(Exception error) {
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorEnvelope(new ErrorBody("Internal", error.getMessage(), false)));
    }

    private static HttpStatus status(String code) {
        return switch (code) {
            case ErrorCodes.NOT_FOUND, ErrorCodes.TOOL_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case ErrorCodes.ALREADY_EXISTS, ErrorCodes.CONFLICT -> HttpStatus.CONFLICT;
            case ErrorCodes.PROVIDER_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case ErrorCodes.NOT_IMPLEMENTED -> HttpStatus.NOT_IMPLEMENTED;
            default -> HttpStatus.BAD_REQUEST;
        };
    }
}

