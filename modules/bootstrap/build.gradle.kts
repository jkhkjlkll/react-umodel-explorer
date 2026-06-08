dependencies {
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
    implementation("org.springframework:spring-context")
    implementation("org.springframework:spring-beans")
}

