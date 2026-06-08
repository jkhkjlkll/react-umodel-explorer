package com.alibaba.umodel.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {
        "com.alibaba.umodel.server",
        "com.alibaba.umodel.bootstrap"
})
public class UModelServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(UModelServerApplication.class, args);
    }
}

