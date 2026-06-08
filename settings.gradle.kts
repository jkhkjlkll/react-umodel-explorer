pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "umodel-java"

include(
    "apps:umodel-server",
    "modules:contract",
    "modules:bootstrap",
    "modules:workspace",
    "modules:umodel",
    "modules:entitystore",
    "modules:graphstore-api",
    "modules:graphstore-memory",
    "modules:graphstore-file",
    "modules:query",
    "modules:agentgateway",
    "modules:sampledata",
)

