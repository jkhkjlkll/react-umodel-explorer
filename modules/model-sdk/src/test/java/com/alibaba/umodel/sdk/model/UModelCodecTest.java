package com.alibaba.umodel.sdk.model;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static com.alibaba.umodel.sdk.model.StandardModelTypes.DataLinkV100;
import static com.alibaba.umodel.sdk.model.StandardModelTypes.EntitySetV100;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UModelCodecTest {
    private final UModelCodec codec = new UModelCodec();

    @Test
    void parsesCompatibleYamlIntoRegisteredTypeAndRoundTripsJson() {
        UModelObject parsed = codec.parseYaml("""
                kind: entity_set
                schema:
                  url: umodel.aliyun.com
                  version: v0.1.0
                metadata:
                  domain: devops
                  name: devops.service
                  display_name:
                    en_us: Service
                spec:
                  primary_key_fields: [id]
                  custom_extension: preserved
                """);

        EntitySetV100 entitySet = assertInstanceOf(EntitySetV100.class, parsed);
        assertEquals("devops", entitySet.domain());
        assertEquals("devops.service", entitySet.name());
        assertEquals("preserved", entitySet.getSpec().get("custom_extension"));
        assertTrue(codec.registry().supports("entity_set", "v0.1.0"));
        assertEquals(23, codec.registry().knownTypes().size());

        UModelObject reparsed = codec.parseJson(codec.toJson(entitySet));
        assertInstanceOf(EntitySetV100.class, reparsed);
        assertEquals("devops.service", reparsed.name());
    }

    @Test
    void validatesLinkEndpointsAndSerializesYaml() {
        DataLinkV100 link = assertInstanceOf(DataLinkV100.class, codec.parseYaml("""
                kind: data_link
                schema:
                  version: v1.0.0
                metadata:
                  domain: devops
                  name: devops.service_metrics
                spec:
                  src: {domain: devops, kind: entity_set, name: devops.service}
                  dest: {domain: devops, kind: metric_set, name: devops.metric.service}
                  fields_mapping: {id: service_id}
                """));

        assertEquals("devops.service", link.source().name());
        assertEquals("metric_set", link.destination().kind());
        assertTrue(codec.toYaml(link).contains("fields_mapping"));
    }

    @Test
    void reportsStableErrorCategoryAndPath() {
        UModelSdkException missing = assertThrows(UModelSdkException.class, () -> codec.parseJson("""
                {"kind":"entity_set","schema":{"version":"v1.0.0"},"metadata":{"domain":"devops"},"spec":{}}
                """));
        assertEquals(UModelSdkException.Category.MISSING_FIELD, missing.category());
        assertEquals("metadata.name", missing.path());

        UModelSdkException unknown = assertThrows(UModelSdkException.class, () -> codec.parseJson("""
                {"kind":"custom_kind","schema":{"version":"v1.0.0"},"metadata":{"domain":"devops","name":"custom"},"spec":{}}
                """));
        assertEquals(UModelSdkException.Category.UNKNOWN_TYPE, unknown.category());
        assertEquals("kind", unknown.path());

        UModelSdkException version = assertThrows(UModelSdkException.class, () -> codec.parseJson("""
                {"kind":"entity_set","schema":{"version":"v2.0.0"},"metadata":{"domain":"devops","name":"service"},"spec":{}}
                """));
        assertEquals(UModelSdkException.Category.UNSUPPORTED_VERSION, version.category());
        assertEquals("schema.version", version.path());
    }

    @Test
    void supportsDownstreamTypeRegistration() {
        UModelTypeRegistry registry = UModelTypeRegistry.standard()
                .register("custom_kind", "v1.0.0", CustomModel.class);
        UModelCodec customCodec = new UModelCodec(registry);

        CustomModel parsed = assertInstanceOf(CustomModel.class, customCodec.parseJson("""
                {"kind":"custom_kind","schema":{"version":"v1.0.0"},"metadata":{"domain":"demo","name":"custom"},"spec":{"enabled":true}}
                """));
        assertEquals(Map.of("enabled", true), parsed.getSpec());
        assertInstanceOf(CustomModel.class, registry.create("custom_kind", "v1.0.0"));
    }

    public static final class CustomModel extends BaseUModelObject {
        public CustomModel() {
            super("custom_kind");
        }
    }
}
