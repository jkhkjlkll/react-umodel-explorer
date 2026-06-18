package com.alibaba.umodel.search;

import java.util.Map;

public record SearchChunk(
        String docId,
        String source,
        String kind,
        String domain,
        String name,
        String text,
        Map<String, Object> attrs,
        Map<String, Object> metadata,
        Map<String, Object> spec
) {
}
