plugins {
    id("org.springframework.boot")
    id("io.spring.dependency-management")
}

dependencies {
    implementation(project(":modules:bootstrap"))
    implementation(project(":modules:contract"))
    implementation(project(":modules:workspace"))
    implementation(project(":modules:umodel"))
    implementation(project(":modules:entitystore"))
    implementation(project(":modules:graphstore-api"))
    implementation(project(":modules:graphstore-memory"))
    implementation(project(":modules:graphstore-file"))
    implementation(project(":modules:query"))
    implementation(project(":modules:agentgateway"))
    implementation(project(":modules:sampledata"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

